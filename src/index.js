import React, { Component } from 'react'
import ReactDOM from 'react-dom'
class Index extends Component {
  constructor() {
    super(...arguments)
    this.state = {
      data: 1
    }
  }
  handleClick() {
    this.setState({
      data: 1
    })
    this.setState({
      data:10
    })
  }
  render() {
    return (
      <div className="index">
        this is index,{this.state.data}
        <button onClick={this.handleClick.bind(this)}></button>
      </div>
    )
  }
}
function Index1() {
  return (<div>this is Index1</div>)
}


ReactDOM.render(<Index></Index>, document.getElementById('root'))
// ReactDOM.render(<Index1></Index1>, document.getElementById('root1'))