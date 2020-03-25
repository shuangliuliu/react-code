import React, { Component, Suspense, Fragment } from 'react'

export default class LazyTest2 extends Component {
  constructor() {
    super(...arguments)
  }
  render() {
    return (
      <div className='lazy_box'>
        <h5>LazyTest2</h5>
      </div>
    )
  }
}