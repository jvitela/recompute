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

function Computation() {
    let observers = {
        list: [], // list of observers, used for fast iteration
        idx: {}   // index by key, used to merge with other computation objects
    };

    const addObserver = (observer) => {
        const key = getObserverKey(observer.id, observer.arg);
        observers.idx[key] = observer;
        observers.list = Object.values(observers.idx);
    };

    const mergeObservers = other => { 
        // Fast merge using the indexes
        Object.assign(
            observers.idx,
            other.observers.idx
        );
        // Regenerate the iteration list
        observers.list = Object.values(observers.idx);
    }

    const dependenciesChanged = state => {
        for (let i = 0, l = observers.list.length; i < l; ++i) {
            const observer = observers.list[i];
            const newResult = observer.arg === undefined
                ? observer.resultFunc(state)
                : observer.resultFunc(state, observer.arg);

            if (! observer.isEqual(newResult, observer.result)) {
                return true;
            }
        }

        return false;
    }

    return {
        // For mergeObservers
        observers,
        // interface
        addObserver,
        mergeObservers,
        dependenciesChanged,
        // For testing
        observersIds: () => Object.keys(observers.idx)
    };
}

const createDefaultCache = () => new DefaultCache();

const defaultEquals = (a, b) => a === b;

export function createContext(initialState) {
    const computationsStack  = [];
    let numObservers = 0;
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

        function observer() {
            if (arguments.length > 1) {
                throw new Error('Observer methods cannot be invoked with more than one argument');
            }
            const arg = arguments.length ? arguments[0] : undefined;
            const result = arg !== undefined
                ? resultFunc(state, arg)
                : resultFunc(state);

            // Create a link between this observer and
            //  the selectors calling it.
            if (computationsStack.length) {
                computationsStack.forEach(computation => {
                    computation.addObserver({ id, arg, result, isEqual, resultFunc });
                });
            }

            return result;
        }

        return observer;
    }

    function createSelector(computeFunc, options = {}) {
        // const id = ++numSelectors;
        const cache = options.cache || createDefaultCache();
        const serialize = options.serialize || defaultSerialize;
        let recomputations = 0;

        function selector() {
            let i, l;
            const cacheKey = serialize(arguments);
            let computation = cache.get(cacheKey);

            if (
                !computation ||
                computation.dependenciesChanged(state)  // dependencies didn't change
            ) {
                // invalidate the cache if dependencies changed??
                // if (computation) {
                //     cache.clear();
                // }
                if (!computation) {
                    computation = Computation(cacheKey);
                }

                // Compute new result
                computationsStack.push(computation);
                computation.result = computeFunc.apply(null, arguments);
                computationsStack.pop();

                // Store new computation in the cache
                cache.set(cacheKey, computation);
                ++recomputations;
            }

            // Share observer dependencies with the parent selectors.
            l = computationsStack.length;
            for (i = 0; i < l; ++i) {
                computationsStack[i].mergeObservers(computation);
            }

            return computation.result;
        };

        selector.recomputations = () => recomputations;
        selector.dependencies = function() {
            const cacheKey = serialize(arguments);
            const computation = cache.get(cacheKey);
            if (computation) {
                return computation.observersIds();
            }
        };
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