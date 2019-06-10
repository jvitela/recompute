# Recompute

Simple “selector” library (for Redux and others) inspired by Reselect and Computed properties from MobX, Aurelia and Angular.
Recompute Selectors use a natural syntaxis and can receive N number of arguments.

* Selectors depend on observed state properties.
* Selectors can compute derived data, allowing to store the minimal possible state.
* Selectors are efficient. A selector is not recomputed unless one of its observer dependencies changes.
* Selectors are composable. They can be invoked inside other selectors.
* Selectors can receive any number of arguments.
* State doesn't have to be manually passed from top to bottom.

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

- [Installation](#installation)
- [Example](#example)
  - [Motivation for Memoized Selectors](#motivation-for-memoized-selectors)
  - [Creating a Memoized Selector](#creating-a-memoized-selector)
  - [Composing Selectors](#composing-selectors)
  - [Connecting a Selector to the Redux Store](#connecting-a-selector-to-the-redux-store)

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

Recompute provides two main functions: `createObserver` and `createSelector`.
`createObserver` is used to create functions that return the value of an observed state property. `createSelector` creates memoized selectors based on the observers it invokes. Both `createObserver` and `createSelector` take a function as first argument. If the state tree is mutated in a way that causes the value returned by an observer to change, the memoized selector will call its function and return the result. If the values of the observers are the same as the previous call to the memoized selector, it will return the previously computed value instead of recomputing a new result.

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

In the example above, `getVisibilityFilter` and `getTodos` are observers for state properties `visibilityFilter` and `todos` respectively. They are created as ordinary non-memoized functions because their only job is to create an interface to retrieve the value of specific state properties. In general Observers must be simple and unexpensive functions.
`getVisibleTodos` on the other hand is a memoized selector. It takes the values from `getVisibilityFilter` and `getTodos` and computes the filtered todos list. 

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



So now `getVisibleTodos` has access to `listId`, and everything will be working fine.
Using the `getVisibleTodos` selector with multiple instances of the `VisibleTodoList` container **will correctly memoize**:

