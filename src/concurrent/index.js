import React, { Component, } from 'react'
import { flushSync } from 'react-dom'
class Parent extends Component {
  constructor() {
    super(...arguments)
    this.state = {
      async: true,
      num: 1,
      length: 2000
    }
  }
  componentDidMount() {
    this.interval = setInterval(() => {
      this.updateNum()
    }, 200)
  }
  updateNum() {
    const newNum = this.state.num === 3 ? 0 : this.state.num + 1
    if (this.state.async) {
      this.setState({
        num: newNum,
      })
    } else {
      flushSync(() => {
        this.setState({
          num: newNum,
        })
      })
    }
  }
  componentWillUnmount() {
    // 别忘了清除interval
    if (this.interval) {
      clearInterval(this.interval)
    }
  }
  render() {
    const children = []

    const { length, num, async } = this.state

    for (let i = 0; i < length; i++) {
      children.push(
        <div className="item" key={i}>
          {num}
        </div>,
      )
    }

    return (
      <div className="main">
        async:{' '}
        <input
          type="checkbox"
          checked={async}
          onChange={() => flushSync(() => this.setState({ async: !async }))}
        />
        <div className="wrapper">{children}</div>
      </div>
    )
  }
}
export default class Concurrents extends Component {
  render() {
    return (
      <div>
        <ConcurrentMode>
          <Parent />
        </ConcurrentMode>
      </div>
    )
  }
}