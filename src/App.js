import React, { Component } from 'react'
export default class App extends Component {
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
    this.setState({
      data: 2
    })
    this.setState({
      data: 1
    })
  }
  render() {
    return (
      <div className="App">
        <h6>this is App COmponent</h6>
        <button onClick={this.handleClick.bind(this)}></button>
      </div>
    )
  }
}