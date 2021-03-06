import React from "react";
import { Table, DropdownButton, Dropdown } from "react-bootstrap";
import { playerColor, disconnectedColor } from "./consts";

class Players extends React.Component {
  render() {
    let msg = "";
    let playerState = this.props.playerState;
    let username = this.props.username;

    if (username == null) return "";

    let numPlayers = Object.keys(playerState).length;
    if (numPlayers < 4) {
      msg = (
             <>
              <span>Waiting for players {numPlayers}/4...</span>
              <DropdownButton onSelect={this.props.addBot} title="Add bot">
                <Dropdown.Item eventKey="1">Beginner Bot</Dropdown.Item>
                <Dropdown.Item eventKey="2">Market Making Bot</Dropdown.Item>
                <Dropdown.Item eventKey="3">Coming soon</Dropdown.Item>
              </DropdownButton>
             </>
            );
    } else {
      msg = this.props.isGameActive
        ? "Game on!"
        : "Game will start when all players are ready!";
      msg = (<>{msg} <br /> </>);
    }

    let observers = this.props.observers.length ? (
      <> <br /> <span> {"Observers: " + this.props.observers} </span> </>
    ) : (
      ""
    );

    // fill players up to four names
    let players = Object.keys(playerState);
    while (players.length < 4) {
      players.push("asdf");
    }

    return (
      <div>
        <Table striped bordered hover variant="dark">
          <thead>
            <tr>
              <td>#</td>
              {Object.keys(players).map(key =>
                playerState[players[key]] != null ? (
                  <td
                    key={key}
                    style={
                      players[key] === username
                        ? { color: playerColor }
                        : playerState[players[key]]["connected"] === false
                        ? { color: disconnectedColor }
                        : {}
                    }
                  >
                    {players[key]}
                  </td>
                ) : (
                  <td key={key}></td>
                )
              )}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{this.props.isGameActive ? "# cards" : "Ready?"} </td>
              {Object.keys(players).map(key =>
                playerState[players[key]] != null ? (
                  <td
                    key={key}
                    style={
                      players[key] === username
                        ? { color: playerColor }
                        : playerState[players[key]]["connected"] === false
                        ? { color: disconnectedColor }
                        : {}
                    }
                  >
                    {this.props.isGameActive
                      ? playerState[players[key]]["numCards"]
                      : playerState[players[key]]["ready"]
                      ? "Ready"
                      : ""}
                  </td>
                ) : (
                  <td key={key}></td>
                )
              )}
            </tr>
          </tbody>
        </Table>
        {msg}
        {observers}
        <a
          className="App-link"
          href="https://www.janestreet.com/figgie/"
          target="_blank"
          rel="noopener noreferrer"
          style={{"font-size": "18px"}}
        >
          Full Game Rules
        </a>
      </div>
    );
  }
}

export default Players;
