import React from "react";
import {
  GiTwoCoins,
  GiSandsOfTime
} from "react-icons/gi";
import { playerColor } from "./consts";


class UserInfo extends React.Component {
  constructor() {
    super();
    this.state = { time: Date.now() };
  }

  componentDidMount() {
    this.interval = setInterval(
      () => this.setState({ time: Date.now() }),
      1000
    );
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }

  render() {
    if (!this.props.username) {
      return "";
    }

    function formatDate(ms) {
      if (ms < 0) {
        return "";
      }
      let minutes = Math.floor(ms / 60000);
      let seconds = Math.floor((ms - 60000 * minutes) / 1000);
      function pad(n, width, z) {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
      }
      let seconds_str = pad(seconds, 2);
      return (
        <span id="timer">
          {minutes}:{seconds_str} <GiSandsOfTime />
        </span>
      );
    }


    let userState = this.props.playerState[this.props.username];
    return (
      <div style={{ color: playerColor }}>
        {this.props.gameTimeEnd &&
          formatDate(this.props.gameTimeEnd - this.state.time)}
        {this.props.username}

        {this.props.isObserver ? " [Observer]" : (
          <span>
            <GiTwoCoins style={{ margin: "0px 8px" }} />
            {userState != null ? userState["money"] : "???"}
          </span>
        )}

        {" room " + this.props.roomNumber}
        
        <span id="logoutText" onClick={this.props.returnToLobby}>  
          Return to Lobby  
        </span>
      </div>
    );
  }
}

export default UserInfo;