import chai from 'chai'
import {  createContext  } from '../src/index'

const assert = chai.assert

// Construct 1E6 states for perf test outside of the perf test so as to not change the execute time of the test function
const numOfStates = 1000000
const states = []

for (let i = 0; i < numOfStates; i++) {
  states.push({ a: 1, b: 2 })
}
suite('observer', () => { 
    test('function signature does NOT allow more than two arguments', () => {
        const { createObserver } = createContext();
        assert.throw(
            () => createObserver((_, param1, param2) => param1 + param2 + 1),
            'Observer methods cannot receive more than two arguments'
        )
    })

    test('does NOT allow being invoked with more than one argument', () => {
        const { createObserver } = createContext();
        const sumAll = createObserver(function (_) {
            // arguments[0] is always the internal state
            const a = arguments.length > 1 ? arguments[1] : 0;
            const b = arguments.length > 2 ? arguments[2] : 0;
            const c = arguments.length > 3 ? arguments[3] : 0;
            return a + b + c;
        });
        assert.equal(sumAll(), 0);
        assert.throw(
            () => sumAll(1, 2, 3),
            'Observer methods cannot be invoked with more than one argument'
        );
    })

    test('can be called without parameters', () => { 
        const { createObserver, setState } = createContext({ a: 2 });
        const getA = createObserver(state => state.a);

        assert.equal(getA(), 2);
        setState({ a: 3 });
        assert.equal(getA(), 3);
    })

    test('can be called with one parameter', () => { 
        const { createObserver, setState } = createContext({ a: 1, b:2, c:3 });
        const getProp = createObserver((state, prop) => state[prop]);

        assert.equal(getProp('a'), 1);
        assert.equal(getProp('b'), 2);
        assert.equal(getProp('c'), 3);
        setState({ a: 4, b: 5, c:6 });
        assert.equal(getProp('a'), 4);
        assert.equal(getProp('b'), 5);
        assert.equal(getProp('c'), 6);
    })

    test('direct calls do not conflict with selectors', () => { 
        const { createObserver, createSelector, setState } = createContext({ a: 2 });
        const getA = createObserver(state => state.a);
        const getAA = createSelector(() => getA() * getA());

        assert.equal(getAA(), 4);   // create cache
        setState({ a: 3 });         // change value
        assert.equal(getA(), 3);    // observer won't invalidate any cache
        assert.equal(getAA(), 9);   // cache invalidated when observer runs
    })
})

suite('selector', () => {

    test('basic dependencies discovery', () => { 
        const { createObserver, createSelector } = createContext();
        const getA = createObserver(() => 1);
        const getB = createObserver(() => 2);
        const getAB = createSelector(() => getA() + getB());
        assert.equal(getAB(), 3);
        assert.sameMembers(getAB.dependencies(), [getA.id, getB.id]);
    });

    test('inherits dependencies from children selectors', () => {
        let state = { a: 1, b: 2, c: 3 };
        const { createObserver, createSelector } = createContext();
        const getA = createObserver(() => state.a);
        const getB = createObserver(() => state.b);
        const getC = createObserver(() => state.c);
        const get2B = createSelector(() => getB() * 2);
        const get2C = createSelector(() => getC() * 2);
        const getA2B = createSelector(() => getA() + get2B());
        const getA2C = createSelector(() => getA() + get2C());
        const getABC = createSelector(() => (getA2B() + getA2C()) / 2);

        assert.equal(getABC(), 6); // fill cache
        assert.sameMembers(get2B.dependencies(),  [getB.id]);
        assert.sameMembers(get2C.dependencies(),  [getC.id]);
        assert.sameMembers(getA2B.dependencies(), [getA.id, getB.id]);
        assert.sameMembers(getA2C.dependencies(), [getA.id, getC.id]);
        assert.sameMembers(getABC.dependencies(), [getA.id, getB.id, getC.id]);
    });

    test('basic selector', () => {
        const { createObserver, createSelector, setState } = createContext();
        const getA = createObserver(state => state.a);
        const selector = createSelector(() => getA());

        const firstState = { a: 1 }
        const firstStateNewPointer = { a: 1 }
        const secondState = { a: 2 }

        setState(firstState);
        assert.equal(selector(), 1)
        assert.equal(selector(), 1)
        assert.equal(selector.recomputations(), 1)

        setState(firstStateNewPointer);
        assert.equal(selector(), 1)
        assert.equal(selector.recomputations(), 1) // Wont recompute because observer result didn't change

        setState(secondState);
        assert.equal(selector(), 2)
        assert.equal(selector.recomputations(), 2)
    })


    test('basic selector without setState', () => {
        let state = {};
        const { createObserver, createSelector } = createContext();
        const getA = createObserver(() => state.a);
        const selector = createSelector(() => getA());

        const firstState = { a: 1 }
        const firstStateNewPointer = { a: 1 }
        const secondState = { a: 2 }

        state = firstState;
        assert.equal(selector(), 1)
        assert.equal(selector(), 1)
        assert.equal(selector.recomputations(), 1)
        state = firstStateNewPointer;
        assert.equal(selector(), 1)
        assert.equal(selector.recomputations(), 1)
        state = secondState;
        assert.equal(selector(), 2)
        assert.equal(selector.recomputations(), 2)
    })

    test('basic selector multiple keys', () => {
        const { createObserver, createSelector, setState } = createContext();
        const getA = createObserver(state => state.a);
        const getB = createObserver(state => state.b);
        const selector = createSelector(() => getA() + getB());

        setState({ a: 1, b: 2 })
        assert.equal(selector(), 3)
        assert.equal(selector(), 3)
        assert.equal(selector.recomputations(), 1)

        setState({ a: 3, b: 2 })
        assert.equal(selector(), 5)
        assert.equal(selector(), 5)
        assert.equal(selector.recomputations(), 2)
    })

    test('basic selector passing arguments down', () => {
        const { createObserver, createSelector, setState } = createContext({
            persons: {
                '1': { age: 25, name: 'John' },
                '2': { age: 23, name: 'Jane' }
            }
        });
        const getAge = createObserver((state, id) => state.persons[id].age);
        const getName = createObserver((state, id) => state.persons[id].name);
        const getPerson = createSelector(id => 
            `${getName(id)} is ${getAge(id)} years old`
        );

        assert.equal(getPerson('1'), 'John is 25 years old')
        assert.equal(getPerson('2'), 'Jane is 23 years old')
        assert.equal(getPerson('1'), 'John is 25 years old')
        assert.equal(getPerson('2'), 'Jane is 23 years old')
        assert.equal(getPerson.recomputations(), 2)
    })

    test('Passing down different argument types', () => { 
        const { createObserver, createSelector } = createContext();
        const getProp = createObserver((_, prop) => prop);
        const selProp = createSelector(prop => getProp(prop));

        const objRef = {};
        assert.strictEqual(selProp(objRef), objRef);
        assert.strictEqual(selProp(true), true);
        assert.strictEqual(selProp(2), 2);
        assert.strictEqual(selProp(null), null);
        assert.strictEqual(selProp(), undefined);
        assert.strictEqual(selProp('123'), '123');
    })

    if (!process.env.COVERAGE) {
        test('basic selector cache hit performance without setState', () => {
            let state = {};
            const { createObserver, createSelector } = createContext();
            const getA = createObserver(() => state.a);
            const getB = createObserver(() => state.b);
            const selector = createSelector(() => getA() + getB());

            state = { a: 1, b: 2 }
            const start = new Date()
            for (let i = 0; i < 1000000; i++) {
                selector()
            }
            const totalTime = new Date() - start
        
            assert.equal(selector(), 3)
            assert.equal(selector.recomputations(), 1)
            assert.isBelow(
                totalTime,
                1000,
                'Expected a million calls to a selector with the same arguments to take less than 1 second'
            )
        })

        test('basic selector cache hit performance with setState', () => {
            const { createObserver, createSelector, setState } = createContext();
            const getA = createObserver(state => state.a);
            const getB = createObserver(state => state.b);
            const selector = createSelector(() => getA() + getB());

            setState({ a: 1, b: 2 });
            const start = new Date()
            for (let i = 0; i < 1000000; i++) {
                selector()
            }
            const totalTime = new Date() - start
        
            assert.equal(selector(), 3)
            assert.equal(selector.recomputations(), 1)
            assert.isBelow(
                totalTime,
                1000,
                'Expected a million calls to a selector with the same arguments to take less than 1 second'
            )
        })

        test('basic selector cache hit performance for state changes but shallowly equal selector args without setState', () => {
        
            let state = {};
            const { createObserver, createSelector } = createContext();
            const getA = createObserver(() => state.a);
            const getB = createObserver(() => state.b);
            const selector = createSelector(() => getA() + getB());
        
            const start = new Date();
            for (let i = 0; i < numOfStates; i++) {
                state = states[i];
                selector();
            }
            const totalTime = new Date() - start
        
            state = states[0];
            assert.equal(selector(), 3);
            assert.equal(selector.recomputations(), 1);
            assert.isBelow(
                totalTime,
                1000,
                'Expected a million calls to a selector with the same arguments to take less than 1 second'
            );
        })

        test('basic selector cache hit performance for state changes but shallowly equal selector args with setState', () => {
            const { createObserver, createSelector, setState } = createContext();
            const getA = createObserver(state => state.a);
            const getB = createObserver(state => state.b);
            const selector = createSelector(() => getA() + getB());
        
            const start = new Date();
            for (let i = 0; i < numOfStates; i++) {
                setState(states[i]);
                selector();
            }
            const totalTime = new Date() - start
        
            setState(states[0]);
            assert.equal(selector(), 3);
            assert.equal(selector.recomputations(), 1);
            assert.isBelow(
                totalTime,
                1000,
                'Expected a million calls to a selector with the same arguments to take less than 1 second'
            );
        })        
    }

    test('memoized composite arguments', () => {
        const { createObserver, createSelector, setState } = createContext({ sub: { a: 0 } });
        const getSub = createObserver(state => state.sub);
        const selector = createSelector(() => getSub());

        setState({ sub: { a: 1 } });
        assert.deepEqual(selector(), {  a: 1  })
        assert.deepEqual(selector(), {  a: 1  })
        assert.equal(selector.recomputations(), 1)

        setState({ sub: { a: 2 } });
        assert.deepEqual(selector(), {  a: 2  })
        assert.equal(selector.recomputations(), 2)
    })

    test('can accept arguments', () => {
        const { createObserver, createSelector, setState } = createContext();
        const getA = createObserver(state => state.a);
        const getB = createObserver(state => state.b);
        const selector = createSelector(props =>
            getA() + getB() + props.c
        );

        setState({ a: 1, b: 2 });
        assert.equal(selector({ c: 100 }), 103);
        assert.equal(selector({ c: 101 }), 104);
        assert.equal(selector({ c: 102 }), 105);
        assert.equal(selector.recomputations(), 3);
    })

    test('can memoize arguments', () => {
        const { createObserver, createSelector } = createContext({ units: 'cms' });
        const getUnits = createObserver(state => state.units);
        const sumArgs = createSelector((...args) => {
            const total = args.reduce((acc, val) => acc + val, 0);
            const units = getUnits();
            return `${total} ${units}`;
        });

        assert.equal(sumArgs(1), '1 cms');
        assert.equal(sumArgs(1, 2), '3 cms');
        assert.equal(sumArgs(1, 2, 3), '6 cms');
        assert.equal(sumArgs.recomputations(), 3);

        assert.equal(sumArgs(1), '1 cms');
        assert.equal(sumArgs(1, 2), '3 cms');
        assert.equal(sumArgs(1, 2, 3), '6 cms');
        assert.equal(sumArgs.recomputations(), 3);
    })

    test('recomputes result after exception', () => {
        let called = 0
        const { createObserver, createSelector } = createContext({ a: 1 });
        const getA = createObserver(state => state.a);
        const selector = createSelector(() => {
            getA();
            called++
            throw Error('test error');
        })

        assert.throw(() => selector(), 'test error')
        assert.throw(() => selector(), 'test error')
        assert.equal(called, 2);
    })

    test('does NOT memoize previous result before exception', () => {
        let called = 0;
        const { createObserver, createSelector, setState } = createContext({ a: 0 });
        const getA = createObserver(state => state.a);
        const selector = createSelector(() => {
            const a = getA();
            called++;
            if (a > 1) {
                throw Error('test error');
            }
            return a;
        });

        setState({ a: 1 });
        assert.equal(selector(), 1);

        // Cache invalidation is tested before calling the selector,
        //  calling the related observers to see if the return value changes
        setState({ a: 2 });
        assert.throw(() => selector(), 'test error');

        setState({ a: 1 });
        assert.equal(selector(), 1);
        assert.equal(called, 3);
    })

    test('chained selector', () => {
        const { createObserver, createSelector, setState } = createContext();

        const getSub = createObserver(state => state.sub)
        const selector1 = createSelector(() => getSub())
        const selector2 = createSelector(() => selector1().value)

        setState({ sub: { value: 1 } })
        assert.equal(selector2(), 1)
        assert.equal(selector2(), 1)
        assert.equal(selector2.recomputations(), 1)
        
        setState({ sub: { value: 2 } })
        assert.equal(selector2(), 2)
        assert.equal(selector2.recomputations(), 2)
    })

    test('chained selector with props', () => {
        const { createObserver, createSelector, setState } = createContext()

        const getSub = createObserver(state => state.sub);
        const getX = props => props.x;
        const getY = props => props.y;

        const selector1 = createSelector(props => {
            const sub = getSub();
            const x = getX(props);
            return { sub, x };
        })

        const selector2 = createSelector(props => {
            const param = selector1(props)
            const y = getY(props)
            return param.sub.value + param.x + y
        })

        setState({ sub: { value: 1 } })
        assert.equal(selector2({ x: 100, y: 200 }), 301)
        assert.equal(selector2({ x: 100, y: 200 }), 301)
        assert.equal(selector2.recomputations(), 1)

        setState({ sub: { value: 2 } })
        assert.equal(selector2({ x: 100, y: 201 }), 303)
        assert.equal(selector2.recomputations(), 2)
    })

    test('chained selector with variadic args', () => {
        const { createObserver, createSelector, setState } = createContext()

        const getSub = createObserver(state => state.sub)

        const selector1 = createSelector((props, another) => ({
            sub: getSub(),
            x: (props.x + another)
        }))

        const selector2 = createSelector((props, another) => {
            const param = selector1(props, another);
            return param.sub.value + param.x + props.y
        })

        setState({ sub: { value: 1 } })
        assert.equal(selector2({ x: 100, y: 200 }, 100), 401)
        assert.equal(selector2({ x: 100, y: 200 }, 100), 401)
        assert.equal(selector2.recomputations(), 1)

        setState({ sub: { value: 2 } })
        assert.equal(selector2({ x: 100, y: 201 }, 200), 503)
        assert.equal(selector2.recomputations(), 2)
    })


    test('dependency discovery after param changes', () => {
        let state = { a: 20, b: 5 };
        const { createObserver, createSelector } = createContext();
        const getA = createObserver(() => state.a);
        const getB = createObserver(() => state.b);
        const getRes = createSelector(c => { 
            let result = getA();
            if (c < 5) {
                result += getB();
            }
            return result + c;
        });

        assert.equal(getRes(5), 25);  // create cache, b not read yet
        assert.equal(getRes(1), 26);  // recompute, discover b as dependency
        state.b += 1;                 // change b
        assert.equal(getRes(1), 27);  // recompute
        assert.equal(getRes.recomputations(), 3);
    });

    test('dependency discovery after observed value changes', () => {
        let state = { a: 20, b: 5 };
        const { createObserver, createSelector } = createContext();
        const getA = createObserver(() => state.a);
        const getB = createObserver(() => state.b);
        const getRes = createSelector(() => { 
            let result = getA();
            if (result < 15) {
                result += getB();
            }
            return result;
        });

        assert.equal(getRes(), 20);   // create cache, b not read yet
        state.a = 10;                 // change a
        assert.equal(getRes(), 15);   // recompute, discover b as dependency
        state.b = 6;                  // change b
        assert.equal(getRes(), 16);   // recompute 
    });

    test('use selector result as input for another selector', () => {
        const { createSelector, createObserver } = createContext();

        let state = {
            result: '3',
            entities: {
                items: {
                    '1': { name: 'John', gender: 'M' },
                    '2': { name: 'Jane', gender: 'F' },
                    '3': { name: 'Jacob', gender: 'M' },
                    '4': { name: 'Jaqueline', gender: 'F' },
                    '5': { name: 'Jenny', gender: 'F' }
                }
            }
        };

        const getSelectedId = createObserver(() => state.result);
        const getItemsById = createObserver(() => state.entities.items);
        const getItem = createSelector(id =>
            getItemsById()[id]
        );
        const getSelectedItem = createSelector(() =>
            getItem(getSelectedId())
        );

        getSelectedItem();
        getSelectedItem();
        assert.strictEqual(getSelectedItem(), state.entities.items[state.result]);
        assert.equal(getSelectedItem.recomputations(), 1);

        state.result = '2'; // we can directly change the observed properties
        getSelectedItem();
        getSelectedItem();
        assert.strictEqual(getSelectedItem(), state.entities.items['2']);
        assert.equal(getSelectedItem.recomputations(), 2);
    });

    test('recomputes only when observed values change', () => {
        const state = { sizes: ['S','M','L'] };
        const { createSelector, createObserver } = createContext();
        const smallestSize = createObserver(() => state.sizes[0]);
        const biggestSize = createObserver(() => {
            const l = state.sizes.length - 1;
            return state.sizes[l];
        });
        const minMax = createSelector(() =>
            smallestSize() + '-' + biggestSize()
        );

        assert.equal(minMax(), 'S-L');
        assert.equal(minMax.recomputations(), 1);

        // Selector won't recompute because the observed values didn't change
        state.sizes = ['S', 'S+', 'M', 'M+', 'L'];
        assert.equal(minMax(), 'S-L');
        assert.equal(minMax.recomputations(), 1);
    })

    // See: https://github.com/caiogondim/fast-memoize.js/commit/bb6f8a550c6b1efbec6a236bb549edbd5bbcbaa1
    test('single argument type detection', () => {
        let state = { label: '' };
        const { createSelector, createObserver } = createContext();
        const getLabel = createObserver(() => state.label);
        const kindOf = createSelector(arg => {
            const type = (
                arg && typeof arg === "object"
                    ? arg.constructor.name
                    : typeof arg
            );
            return getLabel() + type;
        });

        let undefinedValue;
        assert.equal(kindOf(undefinedValue), 'undefined');
        assert.equal(kindOf(), 'undefined');
        assert.equal(kindOf(null), 'object');
        assert.equal(kindOf({}), 'Object');
        assert.equal(kindOf([]), 'Array');
        assert.equal(kindOf(2), 'number');
        assert.equal(kindOf('2'), 'string');
        assert.equal(kindOf(false), 'boolean');
        assert.equal(kindOf.recomputations(), 8);
    })

    test('custom equality comparator for observers', () => { 
        let state = { value: 2 };
        const { createSelector, createObserver } = createContext();
        
        let equalityChecks = 0;
        const isSimilar = (a, b) => {
            ++equalityChecks;
            return a == b;
        };
        const getStateValue = createObserver(() => state.value, { isEqual: isSimilar });
        const getValue = createSelector(() => getStateValue());

        assert.strictEqual(getValue(), 2);
        // Change the value of the observed property to a similar
        //  value so that the equality check pass
        state.value = '2';
        // Calling the selector returns the value from the cache
        assert.strictEqual(getValue(), 2);
        // verify custom equality comparator was called and 
        //  selector computed only once.
        assert.equal(equalityChecks, 1);
        assert.equal(getValue.recomputations(), 1);
    })

    test('custom serializer for selectors arguments', () => {
        let state = { total: { amount: 100, currency: 'EUR' } };
        const { createSelector, createObserver } = createContext();
        let serializeCount = 0;
        const serializeArgs = args => {
            ++serializeCount;
            return JSON.stringify(args);
        }
        const getTotal = createObserver(() => state.total);
        const getTotalStr = createSelector(
            decimals => {
                const { amount, currency } = getTotal();
                return `${amount.toFixed(decimals)} ${currency}`;
            },
            {
                serialize: serializeArgs
            });

        assert.equal(getTotalStr(2), '100.00 EUR');
        assert.equal(serializeCount, 1);
    })

    test('custom cache for selector', () => {
        let state = { total: { amount: 100, currency: 'EUR' } };
        const { createSelector, createObserver } = createContext();

        let cache = {};
        const has = key => (key in cache);
        const get = key => cache[key];
        const set = (key, value) => cache[key] = value;
        const clear = () => cache = {}; 

        const getTotal = createObserver(() => state.total);
        const getTotalStr = createSelector(
            decimals => {
                const { amount, currency } = getTotal();
                return `${amount.toFixed(decimals)} ${currency}`;
            },
            {
                cache: { has, get, set, clear }
            });

        assert.equal(getTotalStr(0), '100 EUR');
        assert.equal(getTotalStr(2), '100.00 EUR');
        assert.equal(cache['0'].result, '100 EUR');
        // assert.equal(cache['1'].result, undefined);
        assert.equal(cache['2'].result, '100.00 EUR');

        // change total so that cache invalidates
        state.total = { amount: 10, currency: 'GBP' };
        assert.equal(getTotalStr(0), '10 GBP');
        assert.equal(getTotalStr(1), '10.0 GBP');
        assert.equal(cache['0'].result, '10 GBP');
        assert.equal(cache['1'].result, '10.0 GBP');
        // assert.equal(cache['2'].result, undefined);
    })

    test('cascade dependencies', () => {
        const { createSelector, createObserver, setState } = createContext({
            a: 5,
            b: 10,
            c: 15
        });

        const getA = createObserver(state => state.a);
        const getB = createObserver(state => state.b);
        const getC = createObserver(state => state.c);
        const getAB = createSelector(() => { 
            let res = getB();
            if (res < 10) {
                res += getA();
            }
            return res;
        });
        const getAC = createSelector(() => { 
            let res = getA();
            if (res < 0) {
                res += getC();
            }
            return res;
        });

        assert.equal(getAB(), 10);
        assert.equal(getAC(), 5);
        assert.sameMembers(getAB.dependencies(), [getB.id]);
        assert.sameMembers(getAC.dependencies(), [getA.id]);

        setState({
            a: -5,
            b: 5,
            c: 15
        });

        assert.equal(getAB(), 0);
        assert.sameMembers(getAB.dependencies(), [getA.id, getB.id]);
        assert.equal(getAC(), 10);
        assert.sameMembers(getAC.dependencies(), [getA.id, getC.id]);
    });

    test('multiple dependencies to same observer', () => { 
        const state = {
            persons: {
                '1': { age: 25 },
                '2': { age: 22 },
                '3': { age: 30 }
            }
        };
        const { createObserver, createSelector } = createContext(state);
        const getAge = createObserver((state, id) => state.persons[id].age);
        const getYoungest = createSelector(ids => 
            ids.reduce((acc, id) => {
                const val = getAge(id);
                return acc < val ? acc : val;
            }, Infinity)
        );
        assert.equal(getYoungest(['1', '2', '3']), 22);
        state.persons['1'].age = 19;
        assert.equal(getYoungest(['1', '2', '3']), 19);
        assert.equal(getYoungest.recomputations(), 2);
    })

    test('discover dependency from used selector', () => { 
        const { createObserver, createSelector } = createContext();

        const getC = createObserver(() => 1);
        const getB = createSelector(() => getC());
        const getA = createSelector(() => getB());

        assert.equal(getB(), 1); // register getC as dependency
        assert.equal(getA(), 1); // inherits getC as dependency from getB
        assert.equal(getA(), 1); // uses cache
        assert.equal(getB.recomputations(), 1);
        assert.equal(getA.recomputations(), 1);
    })

    test('Updates cache when a dependency changes', () => {
        const { createObserver, createSelector } = createContext();
        let value  = 1;
        const getter = createObserver(() => value);
        const selector = createSelector(() => getter());

        assert.equal(selector(), 1);

        value = undefined;
        assert.equal(selector(), undefined);

        value = 3;
        assert.equal(selector(), 3);
    })
});

suite('test utils', () => {
    test('Observer ids', () => { 
        const { createObserver } = createContext();
        const getA = createObserver(() => 1);
        const getB = createObserver(() => 2);
        assert.exists(getA.id);
        assert.exists(getB.id);
        assert.notEqual(getA.id, getB.id);
    })

    test('Clear cache', () => { 
        const { createObserver, createSelector } = createContext();
        const getA = createObserver(() => 2);
        const getB = createObserver(() => 3);
        const getAtimesB = createSelector(() => getA() * getB());
        assert.isArray(getAtimesB.dependencies());
        assert.isEmpty(getAtimesB.dependencies());
        assert.equal(getAtimesB(), 6);
        assert.includeOrderedMembers(getAtimesB.dependencies(), [
            getA.id,
            getB.id
        ]);
    })
 
    test('Mock cached results', () => {
        const { createObserver, createSelector } = createContext();
        const getA = createObserver(() => 2);
        const timesA = createSelector(times => getA() * times);

        timesA.mock(5).result(10);
        timesA.mock(10).result(20);
        assert.equal(timesA(5),  10);
        assert.equal(timesA(10), 20);
        assert.equal(timesA.recomputations(), 0);
    })

    test('Mock nested selectors', () => {
        const { createObserver, createSelector } = createContext();
        const getA = createObserver(() => 2);
        const getB = createObserver(() => 3);
        const timesA = createSelector(() => getA() * 2);
        const timesB = createSelector(() => getB() * 3);
        const sumAB = createSelector(() => timesA() + timesB());

        timesA.mock().result(5);
        timesB.mock().result(6);
        assert.equal(sumAB(), 11);
        assert.equal(timesA.recomputations(), 0);
        assert.equal(timesB.recomputations(), 0);
        assert.equal(sumAB.recomputations(),  1);
    })

    test('Clear cache', () => { 
        const { createObserver, createSelector } = createContext();
        const getA = createObserver(() => 2);
        const timesA = createSelector(times => getA() * times);

        timesA.mock(2).result(4);
        timesA.mock(3).result(6);
        assert.equal(timesA(2), 4);
        assert.equal(timesA(3), 6);
        assert.equal(timesA.recomputations(), 0);

        timesA.clearCache();
        assert.equal(timesA(2), 4);
        assert.equal(timesA(3), 6);
        assert.equal(timesA.recomputations(), 2);

        assert.equal(timesA(2), 4);
        assert.equal(timesA(3), 6);
        assert.equal(timesA.recomputations(), 2);

        timesA.clearCache();
        assert.equal(timesA(2), 4);
        assert.equal(timesA(3), 6);
        assert.equal(timesA.recomputations(), 4);
    })
});