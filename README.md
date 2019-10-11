# Recompute

[![Travis][build-badge]][build]
[![npm package][npm-badge]][npm]

Simple “selector” library (for Redux and others) inspired by Reselect and Computed properties from MobX, Aurelia and Angular.

Recompute is based on Observers and Selectors. Observers are simple non memoized functions used to read specific state properties. Selectors are memoized functions that compute results based on the values returned by one or more observers.

* Observers have access to the entire state object.
* Observers provide an interface to read from the state
* Observers are Not memoized.
* Observers should be cost efficient.
* Observers can take one optional argument.

* Selectors use observers to read values from the state
* Selectors depend on observed state properties.
* Selectors can compute derived data, allowing to store the minimal possible state.
* Selectors are efficient. A selector is not recomputed unless one of its observer dependencies changes.
* Selectors are composable. They can be invoked inside other selectors.
* Selectors can receive any number of arguments.

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
  - [`createObserver`](#createobserver-resultfunc-options)
  - [`createSelector`](#createselector-resultfunc-options)

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
Using the `getVisibleTodos` selector with multiple instances of the `VisibleTodoList` container will correctly memoize

A selector created with `createSelector` has an unlimited cache size and can return different cached results depending on the arguments passed to the selector. When at least one of the state properties read by the selector changes, its complete cache will be cleared.

## API
### createObserver(resultFunc, options = {})
Recompute determines if the value returned by `resultFunc` has changed between calls using reference equality (`===`). Alternatively you can pass a custom equality comparator to the options object:

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

### createSelector(resultFunc, options = {})
Selectors created with `createSelector` have an unlimited cache. This means they always store the last result matching its set of arguments.
A selector recomputes when invoked with a different set of arguments. 
Its cache will be cleared when at least one of the observers it depends on returns a different value.

[build-badge]: https://travis-ci.org/jvitela/recompute.svg?branch=master
[build]: https://travis-ci.org/jvitela/recompute

[npm-badge]: https://img.shields.io/npm/v/@jvitela/recompute.svg?style=flat-square
[npm]: https://www.npmjs.com/package/@jvitela/recompute
