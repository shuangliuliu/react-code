import React, { Component, Suspense, Fragment } from './react/packages/react'
import ReactDOM from './react/packages/react-dom'
import App from './createEle'

// cloneElement使用开始
const cloneChild1 = React.createElement(
  'p',
  {
    className: 'clone_child_1',
    key: 'clone_child_1'
  }
)
const cloneChild2 = React.createElement(
  'p',
  {
    className: 'clone_child_2',
    key: 'clone_child_2'
  }
)
const cloneChild3 = React.createElement(
  'p',
  {
    className: 'clone_child_3',
    key: 'clone_child_3'
  }
)
const cloneEle = React.cloneElement(
  <div />,
  {
    key: 'clone',
    className: 'clone_class',
    name: 'userName'
  },
  'cloneElement', cloneChild1, cloneChild2, cloneChild3
)
// cloneElement使用结束

// createElement开始

const obj = {
  names: 'liushuang',
  ages: 15
}
class Index extends Component {
  constructor() {
    super(...arguments)
    this.indexRef = React.createRef()
  }
  render() {
    return (
      <div id='index'>
        <App className='app_3'>
          <div className='app_child_1' key='app_child_1'>app_child_1</div>
          <div className='app_child_2' key='app_child_2'>app_child_2</div>
          <div className='app_child_3' key='app_child_3'>app_child_3</div>
        </App>
      </div>
    )
  }
}
// createElement结束
// ReactDOM.render(cloneEle, document.getElementById('app'))
// ReactDOM.render(<div><span>dddd</span><span>dddd</span></div>, document.getElementById('app'))
ReactDOM.render(<Index key='index' />, document.getElementById('app'))


module.hot && module.hot.accept();