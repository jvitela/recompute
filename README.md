# Recompute

Simple “selector” library (for Redux and others) inspired by Reselect and Computed properties from MobX, Aurelia and Angular.
Recompute Selectors use a more natural syntaxis and can receive N number of arguments.

* Selectors depend on observed state properties.
* Selectors can compute derived data, allowing to store the minimal possible state.
* Selectors are efficient. A selector is not recomputed unless one of its observer dependencies changes.
* Selectors are composable. They can be used as inside to other selectors.
* Selectors can receive any number of arguments

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

const total = createSelector(currency => 
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

- [Example](#example)
  - [Motivation for Memoized Selectors](#motivation-for-memoized-selectors)
  - [Creating a Memoized Selector](#creating-a-memoized-selector)
  - [Composing Selectors](#composing-selectors)
  - [Connecting a Selector to the Redux Store](#connecting-a-selector-to-the-redux-store)
  - [Accessing React Props in Selectors](#accessing-react-props-in-selectors)
  - [Sharing Selectors with Props Across Multiple Component Instances](#sharing-selectors-with-props-across-multiple-component-instances)
- [API](#api)
  - [`createSelector`](#createselectorinputselectors--inputselectors-resultfunc)
  - [`defaultMemoize`](#defaultmemoizefunc-equalitycheck--defaultequalitycheck)
  - [`createSelectorCreator`](#createselectorcreatormemoize-memoizeoptions)
  - [`createStructuredSelector`](#createstructuredselectorinputselectors-selectorcreator--createselector)

## Installation
In development...

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

Reselect provides a function `createObserver` for creating input-selectors that will return the value of a certain state property, it also provices a function `createSelector` for creating memoized selectors based on the input-selectors it invokes. Both `createObserver` and `createSelector` take a function as argument. If the Redux state tree is mutated in a way that causes the value returned by an input-selector to change, the memoized-selector will call its function and return the result. If the values of the input-selectors are the same as the previous call to the memoized-selector, it will return the previously computed value instead of calling the function.

Let's define a memoized-selector named `getVisibleTodos` to replace the non-memoized version above:

#### `selectors/index.js`

```js
import { createObserver, createSelector } from 'recompute'

const getVisibilityFilter = createObserver(state => state.visibilityFilter) // input-selector
const getTodos = createObserver(state => state.todos) // input-selector

// memoized-selector
export const getVisibleTodos = createSelector(() => {
    switch (getVisibilityFilter()) {
      case 'SHOW_ALL':
        return getTodos()
      case 'SHOW_COMPLETED':
        return getTodos().filter(t => t.completed)
      case 'SHOW_ACTIVE':
        return getTodos().filter(t => !t.completed)
    }
  }
)
```

In the example above, `getVisibilityFilter` and `getTodos` are input-selectors. They are created as ordinary non-memoized selector functions because they do not transform the data they select. `getVisibleTodos` on the other hand is a memoized selector. It takes `getVisibilityFilter` and `getTodos` as input-selectors, and a transform function that calculates the filtered todos list.

### Composing Selectors

A memoized selector can itself be invoked inside another memoized selector. Here is `getVisibleTodos` being used as an input-selector to a selector that further filters the todos by keyword:

```js
const getKeyword = createObserver(state => state.keyword)

const getVisibleTodosFilteredByKeyword = createSelector(() => {
  const keyword = getKeyword()
  return getVisibleTodos().filter(
    todo => todo.text.includes(keyword)
  )
})
```
### Connecting a Selector to the Redux Store

If you are using [React Redux](https://github.com/reduxjs/react-redux), you can call selectors as regular functions inside `mapStateToProps()`:

#### `containers/VisibleTodoList.js`

```js
import { connect } from 'react-redux'
import { toggleTodo } from '../actions'
import TodoList from '../components/TodoList'
import { setState } from 'recompute'
import { getVisibleTodos } from '../selectors'

const mapStateToProps = (state) => {
  setState(state); // update the state used by the observers
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

### Using arguments in Selectors

> This section introduces a hypothetical extension to our app that allows it to support multiple Todo Lists. Please note that a full implementation of this extension requires changes to the reducers, components, actions etc. that aren’t directly relevant to the topics discussed and have been omitted for brevity.

So far we have only seen selectors receive the Redux store state as an argument, but a selector can receive props too.

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

Each `VisibleTodoList` container should select a different slice of the state depending on the value of the `listId` prop, so let’s modify `getVisibilityFilter` and `getTodos` to accept an argument:

#### `selectors/todoSelectors.js`

```js
import { setState, createObserver, createSelector } from 'recompute'

const getTodoLists = createObserver(state => state.todoLists)

const getTodoList = createSelector(listId => getTodoLists()[listId])

const getVisibilityFilter = createSelector(listId =>
  getTodoList(listId).visibilityFilter
)

const getTodos = createSelector(listId =>
  getTodoList(listId).todos
)

const getVisibleTodos = createSelector(listId => {
  const todos = getTodos(listId)
  const visibilityFilter = getVisibilityFilter(listId)
  switch (visibilityFilter) {
    case 'SHOW_COMPLETED':
      return todos.filter(todo => todo.completed)
    case 'SHOW_ACTIVE':
      return todos.filter(todo => !todo.completed)
    default:
      return todos
  }
})

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

So now `getVisibleTodos` has access to `listId`, and everything will be working fine.
Using the `getVisibleTodos` selector with multiple instances of the `VisibleTodoList` container **will correctly memoize**:

