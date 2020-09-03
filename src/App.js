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
        {[1, 2, 4, 5, 6]}
      </div>
    )
  }
}