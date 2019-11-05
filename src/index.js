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

    // has(key) {
    //     return (key in this.cache);
    // }

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

class Computation {
    constructor() {
        this.observersList = []; // list of observers, used for fast iteration
        this.observersIdx = {};   // index by key, used to merge with other computation objects
    }

    addObserver(observer) {
        const key = getObserverKey(observer.id, observer.arg);
        this.observersIdx[key] = observer;
        this.observersList = Object.values(this.observersIdx);
    }

    mergeObservers(other) { 
        // Fast merge using the indexes
        Object.assign(
            this.observersIdx,
            other.observersIdx
        );
        // Regenerate the iteration list
        this.observersList = Object.values(this.observersIdx);
    }

    dependenciesChanged(state) {
        for (let i = 0, l = this.observersList.length; i < l; ++i) {
            const observer = this.observersList[i];
            const newResult = observer.arg === undefined
                ? observer.resultFunc(state)
                : observer.resultFunc(state, observer.arg);

            if (! observer.isEqual(newResult, observer.result)) {
                return true;
            }
        }

        return false;
    }

    // For testing
    getObserversIds() {
        return Object.keys(this.observersIdx);
    }
}

const createDefaultCache = () => new DefaultCache();

const defaultEquals = (a, b) => a === b;

class Observer {
    constructor(id, resultFunc, isEqual, ctx) {
        this.id = `${id}`; // ensure string so that Computation can index by Id
        this.resultFunc = resultFunc;
        this.isEqual = isEqual;
        this.ctx = ctx;
    }

    invoke() {
        if (arguments.length > 1) {
            throw new Error('Observer methods cannot be invoked with more than one argument');
        }
        const arg = arguments.length ? arguments[0] : undefined;
        const result = arg !== undefined
            ? this.resultFunc(this.ctx.state, arg)
            : this.resultFunc(this.ctx.state);

        // Create a link between this observer and
        //  the selectors calling it.
        for (let i = 0, l = Context.callStack.length; i < l; ++i) { 
            Context.callStack[i].addObserver({
                id: this.id,
                isEqual: this.isEqual,
                resultFunc: this.resultFunc,
                arg,
                result,
            });
        }

        return result;
    }

    getProxy() {
        const proxy = this.invoke.bind(this);
        proxy.id = this.id;
        return proxy;
    }
}

class Selector {
    constructor(computeFunc, cache, serialize, ctx) {
        this.recomputations = 0;
        this.computeFunc = computeFunc;
        this.cache = cache;
        this.serialize = serialize;
        this.ctx = ctx;
    }

    mock() {
        const cacheKey = this.serialize(arguments);
        const computation = new Computation(cacheKey);
        this.cache.set(cacheKey, computation);
        return {
            result(res) {
                computation.result = res;
            }
        };
    }

    clearCache() {
        this.cache.clear();
    }

    invoke() {
        const cacheKey = this.serialize(arguments);
        let computation = this.cache.get(cacheKey);

        if (
            !computation ||
            computation.dependenciesChanged(this.ctx.state)  // dependencies didn't change
        ) {
            // invalidate the cache if dependencies changed??
            // if (computation) {
            //     this.cache.clear();
            // }
            if (!computation) {
                computation = new Computation(cacheKey);
            }

            // Compute new result
            Context.callStack.push(computation);
            try {
                computation.result = this.computeFunc.apply(null, arguments);
            } finally {
                Context.callStack.pop();
            }

            // Store new computation in the cache
            this.cache.set(cacheKey, computation);
            ++this.recomputations;
        }

        // Share observer dependencies with the parent selectors.
        for (let i = 0, l = Context.callStack.length; i < l; ++i) {
            Context.callStack[i].mergeObservers(computation);
        }

        return computation.result;
    };
    
    dependencies() {
        const cacheKey = this.serialize(arguments);
        const computation = this.cache.get(cacheKey);
        return computation ? computation.getObserversIds() : [];
    }

    getProxy() {
        const proxy = this.invoke.bind(this);
        proxy.dependencies = this.dependencies.bind(this);
        proxy.mock = this.mock.bind(this);
        proxy.clearCache = this.clearCache.bind(this);
        proxy.recomputations = () => this.recomputations;
        return proxy;
    }
}

class Context {

    constructor(initialState) {
        this.state = initialState;
    }

    setState(newState) {
        this.state = newState;
    }

    createObserver(resultFunc, options = {}) {
        if (resultFunc.length > 2) {
            throw new Error('Observer methods cannot receive more than two arguments');
        }

        const id = ++Context.numObservers;
        // const name = options.name || `observer-${id}`; 
        const isEqual = options.isEqual || defaultEquals;
        const observer = new Observer(id, resultFunc, isEqual, this);
        return observer.getProxy();
    }

    createSelector(computeFunc, options = {}) {
        const cache = options.cache || createDefaultCache();
        const serialize = options.serialize || defaultSerialize;
        const selector = new Selector(computeFunc, cache, serialize, this);
        return selector.getProxy();
    }

    getProxy() {
        return {
            createObserver: this.createObserver.bind(this),
            createSelector: this.createSelector.bind(this),
            setState: this.setState.bind(this)
        };
    }
}

Context.callStack = [];
Context.numObservers = 0;

export const createContext = initialState => {
    const context = new Context(initialState);
    return context.getProxy();
};

const context = createContext();
export const createObserver = context.createObserver;
export const createSelector = context.createSelector;
export const setState = context.setState;