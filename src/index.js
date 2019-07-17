// From fast-memoize
//  See: https://github.com/caiogondim/fast-memoize.js/blob/master/src/index.js
function isPrimitive(value) {
    return (
        value == null ||
        typeof value === 'number' ||
        typeof value === 'boolean'
        // string is an unsafe primitive for our needs
        //  see test for 'single argument type detection'
        // || typeof value === 'string'
    );
}

const _UNDEFINED_ = Symbol('undefined');
const defaultSerialize = args => { 
    if (args.length === 0) {
        return _UNDEFINED_;
    }
    if (args.length === 1 && isPrimitive(args[0])) {
        return `${args[0]}`;
    }
    return JSON.stringify(args);
};

const getObserverKey = (id, arg) => {
    if (arg === undefined) {
        return `${id}`;
    }
    if (isPrimitive(arg)) {
        return `${id}:${arg}`;
    }
    return `${id}:${JSON.stringify(arg)}`;
}

// Also from fast-memoize
class DefaultCache {
    constructor() {
        this.cache = Object.create(null);
    }

    has(key) {
        return (key in this.cache);
    }

    get(key) {
        return this.cache[key];
    }

    set(key, value) {
        this.cache[key] = value;
    }

    clear() {
        this.cache = Object.create(null);
    }
}

const createDefaultCache = () => new DefaultCache();

const defaultEquals = (a, b) => a === b;

export function createContext(initialState) {
    const stackedSelectors  = [];
    let numObservers = 0;
    let numSelectors = 0;
    let state = initialState;

    const setState = newState => state = newState;

    function createObserver(resultFunc, options = {}) {
        if (resultFunc.length > 2) {
            throw new Error('Observer methods cannot receive more than two arguments');
        }

        const id = ++numObservers;

        // let result;
        const isEqual = options.isEqual
            ? options.isEqual
            : defaultEquals;

        const observerInterface = {
            id,
            isEqual,
            resultFunc
        };

        function observer() {
            if (arguments.length > 1) {
                throw new Error('Observer methods cannot be invoked with more than one argument');
            }
            const arg = arguments.length ? arguments[0] : undefined;
            const value = arg !== undefined
                ? resultFunc(state, arg)
                : resultFunc(state);

            // Create a link between this observer and
            //  the selectors calling it.
            if (stackedSelectors.length) {
                stackedSelectors.forEach(selector => {
                    selector.addObserver(observerInterface, value, arg);
                });
            }

            return value;
        }

        return observer;
    }

    function createSelector(computeFunc, options = {}) {
        const id = ++numSelectors;
        const cache = options.cache || createDefaultCache();
        const serialize = options.serialize || defaultSerialize;
        let recomputations = 0;
        let observers = [];
        let observersByKey = {};
        let observerResultsCache = new DefaultCache();

        const addObserver = (observer, result, arg) => {
            const key = getObserverKey(observer.id, arg);
            observerResultsCache.set(key, { result, arg });
            if (key in observersByKey) {
                return;
            }
            const observerRef = Object.assign({ key }, observer);
            observers.push(observerRef);
            observersByKey[key] = observerRef;
        };

        const mergeObservers = (newObserversByKey, newObserverResultsCache) => {
            Object.assign(
                observersByKey,
                newObserversByKey
            );
            // Observer results cache is always of type DefaultCache and has keys created with getObserverKey, 
            //  therefore we can merge its internal cache property
            Object.assign(
                observerResultsCache.cache, 
                newObserverResultsCache.cache
            );
            observers = Object.values(observersByKey);
        }
  
        const dependenciesChanged = () => {
            // Optimized for performance
            let changed = false;
            const prevResults = observerResultsCache; // observer dependencies
            const l = observers.length;

            for (let i = 0; i < l; ++i) {
                const observer = observers[i];
                // Check if the observer result changed and 
                const prev = prevResults.get(observer.key);
                const newResult = prev.arg === undefined
                    ? observer.resultFunc(state)
                    : observer.resultFunc(state, prev.arg);

                if (!observer.isEqual(newResult, prev.result)) {
                    prevResults.set(observer.key, newResult);
                    changed = true;
                    break;
                }
            }

            // Clear the selector's cache if dependencies changed
            if (changed) {
                cache.clear();
            }
            return changed;
        }

        const computeResult = (cacheKey, args) => {
            const result = computeFunc(...args);
            cache.set(cacheKey, result);
            ++recomputations;
            return result;
        };

        const selectorInterface = {
            id,
            addObserver,
            mergeObservers
        };

        function selector() {
            let i, l, result;
            const cacheKey = serialize(arguments);

            if (
                cache.has(cacheKey) &&  // cache exists
                !dependenciesChanged()  // dependencies didn't change
            ) {
                result = cache.get(cacheKey);
                // console.log(`[CACHED] ${id}: ${JSON.stringify(result)}`);

            } else {
                stackedSelectors.push(selectorInterface);
                result = computeResult(cacheKey, arguments);
                stackedSelectors.pop();
                // console.log(`[COMPUTED] ${id}: ${JSON.stringify(result)}`);
            }

            // Share observer dependencies with the parent selectors.
            l = stackedSelectors.length;
            for (i = 0; i < l; ++i) {
                stackedSelectors[i].mergeObservers(observersByKey, observerResultsCache);
            }

            return result;
        };

        selector.recomputations = () => recomputations;
        selector.dependencies = () => Object.keys(observersByKey);
        return selector;
    }

    return {
      createObserver,
      createSelector,
      setState
    };
}

const context = createContext();
export const createObserver = context.createObserver;
export const createSelector = context.createSelector;
export const setState = context.setState;