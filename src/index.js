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

    // const stackResultsCache = createDefaultCache();

    const setState = newState => state = newState;

    function createObserver(resultFunc, options = {}) {
        if (resultFunc.length > 1) {
            throw new Error('Observer methods cannot receive more than one arguments');
        }

        const id = ++numObservers;
        // let parentSelectors = [];
        // let parentSelectorsById = {};

        // let result;
        const isEqual = options.isEqual
            ? options.isEqual
            : defaultEquals

        // const getResult = () => resultFunc(state)
            // stackResultsCache.has(id) ? stackResultsCache.get(id) : resultFunc(state)
        
        // const invalidateCaches = () => {
        //     const value = resultFunc(state);

        //     // if (result === value) {
        //     if (result === value || (isEqual && isEqual(result, value))) {
        //         return false;
        //     }

        //     const l = parentSelectors.length;
        //     for (let i = 0; i < l; ++i) {
        //         parentSelectors[i].invalidateCache();
        //     }

        //     result = value;
        //     return true;
        // };

        // const addSelector = selector => {
        //     if (!!parentSelectorsById[selector.id]) {
        //         return;
        //     }
        //     parentSelectors.push(selector);
        //     parentSelectorsById[selector.id] = selector;
        // };

        const observerInterface = {
            id,
            isEqual,
            resultFunc
            // invalidateCaches
        };

        function observer() {
            if (arguments.length > 0) {
                throw new Error('Observer methods cannot be invoked with arguments');
            }

            const value = resultFunc(state);

            // Create a double link between this observer and
            //  the selectors calling it.
            if (stackedSelectors.length) {
                stackedSelectors.forEach(selector => {
                    // addSelector(selector);
                    selector.addObserver(observerInterface, value);
                });
                // save result only when observer is called
                //  inside a selector
                // result = value;
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
        let observersById = {};
        let observerResultsCache = createDefaultCache();

        // const invalidateCache = () => cache.clear();

        const addObserver = (observer, result) => {
            observerResultsCache.set(observer.id, result);
            if (observer.id in observersById) {
                return;
            }
            observers.push(observer);
            observersById[observer.id] = observer;
        };

        const mergeObservers = newObserversById => {
            Object.assign(
                observersById,
                newObserversById
            );
            observers = Object.values(observersById);
        }
  
        const dependenciesChanged = () => {
            // Optimized for performance
            let changed = false;
            const prevResults = observerResultsCache; // observer dependencies
            const l = observers.length;

            for (let i = 0; i < l; ++i) {
                const observer = observers[i];
                // Check if the observer result changed and 
                //  invalidate related caches
                // if (observers[i].invalidateCaches()) {

                const prevResult = prevResults.get(observer.id);
                const newResult = observer.resultFunc(state);
                if (!observer.isEqual(newResult, prevResult)) {
                    prevResults.set(observer.id, newResult);
                    changed = true;
                }

                // if (!stackResultsCache.has(observer.id)) {
                //     stackResultsCache.set(observer.id, newResult);
                // }
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
            // invalidateCache,
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
                stackedSelectors[i].mergeObservers(observersById);
            }

            // Clear the cache of observer results
            //  if there are no more selectors in the call stack
            // if (l === 0) {
            //     stackResultsCache.clear();
            // }

            return result;
        };

        selector.recomputations = () => recomputations;
        selector.dependencies = () => Object.keys(observersById);
        return selector;
    }

    return {
      createObserver,
      createSelector,
      setState
    };
}