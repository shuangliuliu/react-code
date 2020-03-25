import React, { Component, Suspense, lazy } from 'react'
const LazyTest1 = lazy(() => import('./lazy1'))
const LazyTest2 = lazy(() => import('./lazy2'))
export default class LazyIndex extends Component {
  constructor() {
    super(...arguments)
  }
  fallback() {
    return (
      <div>loading...</div>
    )
  }
  render() {
    return (
      <div className='lazy_box'>
        <Suspense fallback='loading.........'>
          <LazyTest1 />
          <LazyTest2 />
        </Suspense>
      </div>
    )
  }
}