import React, { Component } from 'react'
import ReactDOM from 'react-dom'
import App from './App'
class Index extends Component {
  render() {
    return (
      <div className="index">
        this is index
      </div>
    )
  }
}
// ReactDOM.render(<App />, document.getElementById('root'))
ReactDOM.render(<Index />, document.getElementById('root'))