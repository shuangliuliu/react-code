import React, { Component } from './react/packages/react'

export default class App extends Component {
  constructor() {
    super(...arguments)
    this.ref = React.createRef()
  }
  render() {
    return (
      <div className="App" ref={this.ref}>
        <div className='app_child'>
          {React.Children.map(this.props.children, function (child) {
            return <li>li{child}</li>
          })
          }
        </div>
      </ div>
    )
  }
}
App.defaultProps = {
  name: "Hello React"
}
