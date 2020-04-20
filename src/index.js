import React, { Component } from 'react'
import ReactDOM from 'react-dom'
class Index extends Component {
  render() {
    return (
      <div className="index">
        <Index1 />
      </div>
    )
  }
}
class Index1 extends Component {
  constructor() {
    super(...arguments)
    this.state = {
      data: 1
    }
  }
  handleClick() {
    this.setState({
      data: 100
    })
  }
  render() {
    return (
      <div className="index">
        this is index,{this.state.data}
        <button onClick={this.handleClick.bind(this)}>异步操作</button>
      </div>
    )
  }
}


ReactDOM.render(<Index />, document.getElementById('root'))