import React, { Component } from 'react'
import ReactDOM from 'react-dom'
import App from './App'
class Index extends Component {
  constructor() {
    super(...arguments)
    this.state = {
      data: 1
    }
  }
  handleClick() {
    this.setState({
      data: 3
    })
  }
  render() {
    return (
      <div className="index">
        this is index
        <button onClick={this.handleClick.bind(this)}></button>
      </div>
    )
  }
}
// ReactDOM.render(<App />, document.getElementById('root'))
ReactDOM.render(<Index />, document.getElementById('root'))