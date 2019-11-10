# Recompute

[![Travis][build-badge]][build]
[![npm package][npm-badge]][npm]

Alternative “selector” library (for Redux and others) inspired by Reselect and Computed properties from MobX, Aurelia and Angular.

Recompute is based on Observers and Selectors. Observers are simple non memoized functions used to read specific state properties. Selectors are memoized functions that compute results based on the values returned by one or more observers.

* Observers provide an interface to read from the state
* Selectors can compute derived data, allowing Redux to store the minimal possible state.
* Selectors are efficient. A selector is not recomputed unless one of its dependencies changes.
* Selectors are composable. They can be used as input to other selectors.

## Differences with Reselect
* Selectors can be shared across multiple component instances
* Selectors can take any number of arguments
* Selectors have unbounded cache size
* Selectors use a more intuitive syntax

```js
import { createSelector, createObserver, setState } from '@jvitela/recompute'

const shopItems = createObserver(state => state.shop.items)
const taxPercent = createObserver(state => state.shop.taxPercent)

const subtotal = createSelector(() => 
  shopItems().reduce((acc, item) => acc + item.value, 0)
)

const tax = createSelector(() => 
  subtotal() * (taxPercent() / 100)
)

const total = createSelector((currency) => 
  ({ total: subtotal() + tax(), currency })
)

setState({
  shop: {
    taxPercent: 8,
    items: [
      { name: 'apple', value: 1.20 },
      { name: 'orange', value: 0.95 },
    ]
  }
})

console.log(subtotal()) // 2.15
console.log(tax())      // 0.172
console.log(total('EUR'))    // { total: 2.322, currency: 'EUR' }

```

## Table of Contents

- [Installation](#installation)
- [Example](#example)
  - [Motivation for Memoized Selectors](#motivation-for-memoized-selectors)
  - [Creating a Memoized Selector](#creating-a-memoized-selector)
  - [Composing Selectors](#composing-selectors)
  - [Connecting a Selector to the Redux Store](#connecting-a-selector-to-the-redux-store)
  - [Accessing React Props in Selectors](#accessing-react-props-in-selectors)
- [API](#api)
  - [`createObserver`](#user-content-createobserverresultfunc-options---isequal-)
  - [`createSelector`](#user-content-createselectorresultfunc-options---cache-serialize-)
- [Testing](#testing)

## Installation
npm i @jvitela/recompute

### Motivation for Memoized Selectors

> The examples in this section are based on the [Redux Todos List example](http://redux.js.org/docs/basics/UsageWithReact.html).

#### `containers/VisibleTodoList.js`

```js
import { connect } from 'react-redux'
import { toggleTodo } from '../actions'
import TodoList from '../components/TodoList'

const getVisibleTodos = (todos, filter) => {
  switch (filter) {
    case 'SHOW_ALL':
      return todos
    case 'SHOW_COMPLETED':
      return todos.filter(t => t.completed)
    case 'SHOW_ACTIVE':
      return todos.filter(t => !t.completed)
  }
}

const mapStateToProps = (state) => {
  return {
    todos: getVisibleTodos(state.todos, state.visibilityFilter)
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    onTodoClick: (id) => {
      dispatch(toggleTodo(id))
    }
  }
}

const VisibleTodoList = connect(
  mapStateToProps,
  mapDispatchToProps
)(TodoList)

export default VisibleTodoList
```

In the above example, `mapStateToProps` calls `getVisibleTodos` to calculate `todos`. This works great, but there is a drawback: `todos` is calculated every time the state tree is updated. If the state tree is large, or the calculation expensive, repeating the calculation on every update may cause performance problems. Recompute can help to avoid these unnecessary recalculations.

### Creating a Memoized Selector

We would like to replace `getVisibleTodos` with a memoized selector that recalculates `todos` when the value of `state.todos` or `state.visibilityFilter` changes, but not when changes occur in other (unrelated) parts of the state tree.

Recompute `createObserver` creates a function used to read values from the state.
Recompute `createSelector` creates a function used to compute a result based on the values from one or more observers.

If the state tree is mutated in a way that causes the value returned by an observer to change, the memoized selector will call its function and return the result. If the values of the observers are the same as the previous call to the memoized selector, it will return the previously computed value instead.

Let's define a memoized selector named `getVisibleTodos` to replace the non-memoized version above:

#### `selectors/index.js`

```js
import { createObserver, createSelector } from '@jvitela/recompute'

const getVisibilityFilter = createObserver(state => state.visibilityFilter)
const getTodos = createObserver(state => state.todos)

export const getVisibleTodos = createSelector(() => {
  const todos = getTodos()
  switch (getVisibilityFilter()) {
    case 'SHOW_ALL':
      return todos
    case 'SHOW_COMPLETED':
      return todos.filter(t => t.completed)
    case 'SHOW_ACTIVE':
      return todos.filter(t => !t.completed)
  }
})
```

In the example above, `getVisibilityFilter` and `getTodos` are observers for `state.visibilityFilter` and `state.todos` respectively. They are created as ordinary non-memoized functions because their only job is to create an interface to retrieve the value of specific state properties. In general Observers must be simple and unexpensive functions.
`getVisibleTodos` on the other hand is a memoized selector. It reads the values from the state and returns the filtered todos list. 

### Composing Selectors

A memoized selector can itself be invoked inside another memoized selector. Here is `getVisibleTodos` being called by another selector that further filters the todos by keyword:

```js
const getVisibleTodosFilteredByKeyword = createSelector(
  (keyword) => getVisibleTodos().filter(
    todo => todo.text.includes(keyword)
  )
)
```

### Connecting a Selector to the Redux Store

If you are using [React Redux](https://github.com/reduxjs/react-redux), you can call selectors as regular functions inside `mapStateToProps()`:

#### `containers/VisibleTodoList.js`

```js
import { connect } from 'react-redux'
import { toggleTodo } from '../actions'
import TodoList from '../components/TodoList'
import { getVisibleTodos } from '../selectors'
import { setState } from '@jvitela/recompute'

const mapStateToProps = (state) => {
  setState(state); // Tell recompute which state will be used by the observers
  return {
    todos: getVisibleTodos()
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    onTodoClick: (id) => {
      dispatch(toggleTodo(id))
    }
  }
}

const VisibleTodoList = connect(
  mapStateToProps,
  mapDispatchToProps
)(TodoList)

export default VisibleTodoList
```

### Accessing React Props in Selectors

> This section introduces a hypothetical extension to our app that allows it to support multiple Todo Lists. Please note that a full implementation of this extension requires changes to the reducers, components, actions etc. that aren’t directly relevant to the topics discussed and have been omitted for brevity.

Here is an `App` component that renders three `VisibleTodoList` component instances, each of which has a `listId` prop:

#### `components/App.js`

```js
import React from 'react'
import Footer from './Footer'
import AddTodo from '../containers/AddTodo'
import VisibleTodoList from '../containers/VisibleTodoList'

const App = () => (
  <div>
    <VisibleTodoList listId="1" />
    <VisibleTodoList listId="2" />
    <VisibleTodoList listId="3" />
  </div>
)
```

Each `VisibleTodoList` container should select a different slice of the state depending on the value of the `listId` prop, so let’s modify `getVisibilityFilter` and `getTodos` to accept a listId argument:

#### `selectors/todoSelectors.js`

```js
import { createObserver, createSelector } from '@jvitela/recompute'

const getVisibilityFilter = createObserver((state, listId) =>
  state.todoLists[listId].visibilityFilter
)

const getTodos = createObserver((state, listId) =>
  state.todoLists[listId].todos
)

const getVisibleTodos = createSelector(
  listId => {
    const todos = getTodos(listId);
    const visibilityFilter = getVisibilityFilter(listId);
    switch (visibilityFilter) {
      case 'SHOW_COMPLETED':
        return todos.filter(todo => todo.completed)
      case 'SHOW_ACTIVE':
        return todos.filter(todo => !todo.completed)
      default:
        return todos
    }
  }
)

export default getVisibleTodos
```

`listId` can be passed to `getVisibleTodos` from `mapStateToProps`:

```js
const mapStateToProps = (state, props) => {
  setState(state)
  return {
    todos: getVisibleTodos(props.listId)
  }
}
```

So now `getVisibleTodos` has access to `listId`, and everything is working fine.
Using the `getVisibleTodos` selector with multiple instances of the `VisibleTodoList` container will correctly memoize.

A selector created with `createSelector` has an unlimited cache size and can return different cached results depending on the arguments used to invoke to the selector. When the selector's observed state properties change, its internal cache will be cleared.

## API
### createObserver(resultFunc, options = { isEqual })
Recompute determines if the value returned by `resultFunc` has changed between calls using reference equality (`===`). Alternatively you can pass a custom `isEqual` equality comparator to the options object.

#### Customize `equalityCheck` for `createObserver`

```js
import isEqual from 'lodash\isEqual'
// Performs a deep comparison between two values to determine if they are equivalent. 
const getStateObject = createObserver(state => state.object, { isEqual }); 
```

```js
import moment from 'moment'
const isSameDay = (a,b) => (moment(a).diff(b, 'days') === 0)
const getDateStr = createObserver(state => state.date, { isEqual: isSameDay})
```

Take into account that observers are **not memoized** and using expensive equality functions would have an impact on performance.

### createSelector(resultFunc, options = { cache, serialize })
Selectors created with `createSelector` have an unbounded cache size. This means they always store the last result matching its set of arguments. A selector recomputes when invoked with a different set of arguments. You can manually clear its cache with the `clearCache` method (See [Testing](#testing-cache-clearing) section for details)

#### Custom cache for selector
The selector expects a cache object with the following methods
  - get(key): Return the cache contents associated to given `key`
  - set(key, value): Stores `value` in the cache for `key`
  - clear(): Clear all the contents of the cache

```js
  class CustomCache {
    constructor() { this.contents = {}; } 
    get(key) { return this.contents[key]; }
    set(key, value) { this.contents[key] = value; }
    clear() { this.contents = {}; } 
  };

  const selector = createSelector(selectorFn, { cache: new CustomCache() })
```

#### Custom cache key serializer for selector
The serializer option is used to generate the cache key. This function receives an array with the arguments used to invoke the selector and must return a key to be used by the cache.

```js
  const serialize = args => JSON.stringify(args);
  const selector = createSelector(selectorFn, { serialize })
```

## Testing
For a given state and input, a selector should always produce the same output. 
For this reason they are simple to unit test.

```js
const a = createObserver(state => state.a)
const b = createObserver(state => state.b)

const selector = createSelector(() => ({
  c: a() * 2,
  d: b() * 3
}))

test("selector unit test", () => {
  setState({ a: 1, b: 2 });
  assert.deepEqual(selector(), { c: 2, d: 6 })
  setState({ a: 2, b: 3 });
  assert.deepEqual(selector(), { c: 4, d: 9 })
})
```

### Testing recomputations
It may also be useful to check that the memoization function for a selector works correctly. Each selector has a recomputations method that will return the number of times it has been recomputed:

```js
suite('selector', () => {
  let state = { a: 1, b: 2 }

  const reducer = (state, action) => (
    {
      a: action(state.a),
      b: action(state.b)
    }
  )

  const a = createObserver(state => state.a)
  const b = createObserver(state => state.b)
  const selector = createSelector(() => ({
    c: a() * 2,
    d: b() * 3
  }))

  const plusOne = x => x + 1
  const id = x => x

  test("selector unit test", () => {
    setState(state = reducer(state, plusOne))
    assert.deepEqual(selector(), { c: 4, d: 9 })
    
    setState(state = reducer(state, id))
    assert.deepEqual(selector(), { c: 4, d: 9 })
    assert.equal(selector.recomputations(), 1)
    
    setState(state = reducer(state, plusOne))
    assert.deepEqual(selector(), { c: 6, d: 12 })
    assert.equal(selector.recomputations(), 2)
  })
})
```

### Mocking composed selectors
If you have selectors composed of many other selectors, 
you can mock the result of the nested selectors so that you can test each selector without coupling all of your tests to the entire shape of your state.

For example if you have a set of selectors like this:

```js
export const firstSelector = createSelector( ... )
export const secondSelector = createSelector( ... )
export const thirdSelector = createSelector( ... )

export const myComposedSelector = createSelector(() => 
  firstSelector() * secondSelector() < thirdSelector()
)
```

And then a set of unit tests like this:

```js
test("myComposedSelector unit test", () => {
  firstSelector.mock().result(1);
  secondSelector.mock().result(2);
  thirdSelector.mock().result(3);
  assert(myComposedSelector(), true)

  firstSelector.mock().result(2);
  secondSelector.mock().result(2);
  thirdSelector.mock().result(1);
  assert(myComposedSelector(), false)
})
```

### Test dependency tracking
In order to test dependency tracking of your selectors, you can invoque the method `dependencies` that will return an array of observer ids. Each observer has a unique Id which can be accessed directly
```js
  const getA = createObserver(() => state.a);
  const getB = createObserver(() => state.b);
  const getC = createObserver(() => state.c);
  const get2B = createSelector(() => getB() * 2);
  const get2C = createSelector(() => getC() * 2);
  const getA2B = createSelector(() => getA() + get2B());
  const getA2C = createSelector(() => getA() + get2C());
  const getABC = createSelector(() => (getA2B() + getA2C()) / 2);

  assert.equal(getABC(), 6); // Run once to track dependencies
  assert.sameMembers(get2B.dependencies(),  [getB.id]);
  assert.sameMembers(get2C.dependencies(),  [getC.id]);
  assert.sameMembers(getA2B.dependencies(), [getA.id, getB.id]);
  assert.sameMembers(getA2C.dependencies(), [getA.id, getC.id]);
  assert.sameMembers(getABC.dependencies(), [getA.id, getB.id, getC.id]);
```

And in case of observers that take an argument you can call `key` with the argument in order
  to get the correct dependency id.

```js
  const foo = createObserver((state, opt) => state + opt);
  const bar = createSelector(() => foo('a') + foo('b'));
  bar(); // Run once to track dependencies
  assert.sameMembers(
    bar.dependencies(), 
    [ foo.key('a'), foo.key('b') ]
  );
```

### Testing cache clearing
Finally, each selector has a `clearCache` method that clears the selector cache.

```js
test('Clear cache', () => { 
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
```

[build-badge]: https://travis-ci.org/jvitela/recompute.svg?branch=master
[build]: https://travis-ci.org/jvitela/recompute

[npm-badge]: https://img.shields.io/npm/v/@jvitela/recompute.svg?style=flat-square
[npm]: https://www.npmjs.com/package/@jvitela/recompute
