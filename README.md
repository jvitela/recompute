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
