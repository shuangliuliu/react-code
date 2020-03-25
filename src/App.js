import React, { Component } from 'react'
import { HashRouter as Router, Route, Switch, Redirect, Link } from 'react-router-dom'
import SuspenseDemo from './lazy/index'
// import Concurrent from './concurrent/index'
export default class App extends Component {
  render() {
    return (
      <div className="App">
        <nav className="navs">
        </nav>
        <Router>
          <Link to="/suspense">SuspenseDemo</Link>
          {/* <Link to="/concurrent">ConcurrentModeDemo</Link> */}
          <Switch>
            <Route path="/suspense" component={SuspenseDemo} />
            {/* <Route path="/concurrent" component={Concurrent} /> */}
          </Switch>
        </Router>
      </div>
    )
  }
}