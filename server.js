const express = require("express");
const app = express();
const port = 8080;
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const utils = require("./utils");
const db = require("./queries");
require("isomorphic-fetch");

app.use(express.static(__dirname));
http.listen(port, () => console.log(`Example app listening on port ${port}!`));

let server = "http://localhost:8080";

// Postgres db endpoints
app.get("/players", db.getPlayers);
app.get("/players/:username", db.getMoneyByUsername);
app.post("/players/:username", db.createPlayer);
app.put("/players/:username/:money", db.updatePlayer);
app.delete("/players/:username", db.deletePlayer);

let maxUsers = 40; // TODO: stress test
let suits = ["hearts", "diamonds", "clubs", "spades"];
let actions = ["take", "sell"];
let clearActions = ["clear", "out"];

// state
let initSuitMarket = {
  bid: null,
  bidPlayer: null,
  offer: null,
  offerPlayer: null
};
let initialMarketState = {
  clubs: { ...initSuitMarket },
  spades: { ...initSuitMarket },
  hearts: { ...initSuitMarket },
  diamonds: { ...initSuitMarket }
};
let initialPlayerState = {
  diamonds: null,
  clubs: null,
  hearts: null,
  spades: null,
  numCards: 10,
  money: 300
};
let roomToState = {}; // room number -> market state and player state for that room

// socket and room info
socketidToUsername = {};
socketidToRoomNumber = {};
usernameToRoomNumber = {};

// PARSE FUNCTION
function parseCommand(command, socket) {
  let socketid = socket.id;
  let roomNumber = socketidToRoomNumber[socketid];
  if (!roomToState[roomNumber]) return;
  if (!roomToState[roomNumber]["isGameActive"]) {
    if (command == "start") {
      // TODO: check if there are four players
      startGame(roomNumber, socket);
    } else {
      socket.emit("alert", "Game is not active! Enter <start> to start.");
    }
    return;
  }

  if (command == "end") {
    endGame(roomNumber, socket);
    return;
  }

  let tokens = command.toLowerCase().split(" ");
  let username = socketidToUsername[socketid];

  if (tokens.length == 1) {
    // clear command: clear or out
    let clearAction = tokens[0];
    if (!clearActions.includes(clearAction)) {
      socket.emit("alert", "Command not found: " + command);
      return;
    }

    console.log("clear or out command detected");
    clearPlayer(username, roomNumber);
  } else if (tokens.length == 2) {
    // take command: take SUIT
    // sell command: sell SUIT
    let action = tokens[0];
    let suit = tokens[1];
    if (!actions.includes(action)) {
      socket.emit("alert", "Command not found: " + command);
      return;
    } else if (!suits.includes(suit)) {
      socket.emit("alert", "Error parsing suit: " + suit);
      return;
    }

    console.log("take or sell command detected");
    if (action == "take") {
      takeOffer(suit, username, roomNumber, socket);
    } else {
      sellBid(suit, username, roomNumber, socket);
    }
  } else if (tokens.length == 3) {
    // offer command: SUIT at X
    let suit = tokens[0];
    let price = Number(tokens[2]);
    if (!suits.includes(suit) || tokens[1] != "at" || isNaN(price)) {
      socket.emit("alert", "Command not found: " + command);
      return;
    }

    console.log("offer command detected");
    if (!postOffer(suit, price, username, roomNumber)) {
      socket.emit("alert", "Invalid offer: no card to sell or price too high.");
    }

  } else if (tokens.length == 4) {
    // bid command: X bid for SUIT
    let suit = tokens[3];
    let price = Number(tokens[0]);
    if (
      !suits.includes(suit) ||
      tokens[1] != "bid" ||
      tokens[2] != "for" ||
      isNaN(price)
    ) {
      socket.emit("alert", "Command not found: " + command);
      return;
    }

    console.log("bid command detected");
    if (!postBid(suit, price, username, roomNumber)) {
      socket.emit("alert", "Invalid bid: price too low.");
    }
  }
}

// TRADING AND MARKET FUNCTIONS
function tradeCard(buyer, seller, suit, price, roomNumber) {
  // assumes trade is valid!
  let playerState = roomToState[roomNumber]["playerState"];
  let sellerState = playerState[seller];
  let buyerState = playerState[buyer];

  sellerState[suit] -= 1;
  buyerState[suit] += 1;
  sellerState["numCards"] -= 1;
  buyerState["numCards"] += 1;
  sellerState["money"] += price;
  buyerState["money"] -= price;

  let trade = `${buyer} bought ${suit} from ${seller} for ${price}`;
  let tradeLog = roomToState[roomNumber]["tradeLog"];
  tradeLog.unshift(trade);
  io.to(roomNumber).emit("tradeLogUpdate", tradeLog);
  io.to(roomNumber).emit("alert", "Trade!");

  clearMarket(roomNumber);
  updatePlayers(roomNumber);
}

function postOffer(suit, price, player, roomNumber) {
  let playerState = roomToState[roomNumber]["playerState"];
  let marketState = roomToState[roomNumber]["marketState"];
  let sellerState = playerState[player];
  if (sellerState[suit] < 1) return false; // check have card to sell

  let currentOffer = marketState[suit]["offer"];
  console.log("currentOffer: " + currentOffer);
  console.log("price: " + price);
  if (currentOffer === null || price < currentOffer) {
    // valid offer; check market crossing
    let bidPrice = marketState[suit]["bid"];
    let bidPlayer = marketState[suit]["bidPlayer"];
    console.log("bidPrice: " + bidPrice);
    console.log("bidPlayer: " + bidPlayer);
    if (bidPrice !== null && bidPrice >= price) {
      // crossed market
      if (bidPlayer != player) {
        // if it's yourself, it's allowed
        // otherwise, execute a trade at last bid price
        tradeCard(bidPlayer, player, suit, bidPrice, roomNumber);
        return true; // market already updated and cleared
      }
    }

    // no market crossing or self-crossing: update new offer
    marketState[suit]["offer"] = price;
    marketState[suit]["offerPlayer"] = player;
    broadcastMarketUpdate(roomNumber);
    return true;
  }
  return false;
}

function postBid(suit, price, player, roomNumber) {
  let marketState = roomToState[roomNumber]["marketState"];
  let currentBid = marketState[suit]["bid"];
  console.log("currentBid: " + currentBid);
  console.log("price: " + price);
  if (currentBid === null || price > currentBid) {
    // valid bid; check market crossing
    let offerPrice = marketState[suit]["offer"];
    let offerPlayer = marketState[suit]["offerPlayer"];
    if (offerPrice !== null && offerPrice <= price) {
      // crossed market
      if (offerPlayer != player) {
        // if it's yourself, it's allowed
        // otherwise, execute a trade at last offer price
        tradeCard(player, offerPlayer, suit, offerPrice, roomNumber);
        return true; // market already updated and cleared
      }
    }

    // no market crossing or self-crossing: update new bid
    marketState[suit]["bid"] = price;
    marketState[suit]["bidPlayer"] = player;
    broadcastMarketUpdate(roomNumber);
    return true;
  }
  return false;
}

function takeOffer(suit, username, roomNumber, socket) {
  let marketState = roomToState[roomNumber]["marketState"];
  let price = marketState[suit]["offer"];
  if (price === null) return socket.emit("alert", "No offer to take!");
  let seller = marketState[suit]["offerPlayer"];
  if (seller == username) return socket.emit("alert", "Can't self trade.");

  tradeCard(username, seller, suit, price, roomNumber);
}

function sellBid(suit, username, roomNumber, socket) {
  let marketState = roomToState[roomNumber]["marketState"];
  let playerState = roomToState[roomNumber]["playerState"];
  let price = marketState[suit]["bid"];
  if (price === null) return socket.emit("alert", "No bid to sell to!");
  let buyer = marketState[suit]["bidPlayer"];
  if (buyer == username) return socket.emit("alert", "Can't self trade");
  let userState = playerState[username];
  if (userState[suit] < 1) return socket.emit("alert", "No card to sell.");

  tradeCard(buyer, username, suit, price, roomNumber);
}

function clearMarket(roomNumber) {
  roomToState[roomNumber]["marketState"] = utils.deepCopy(initialMarketState);
  broadcastMarketUpdate(roomNumber);
}

function clearPlayer(username, roomNumber) {
  suits.forEach(suit => {
    let suitMarketState = roomToState[roomNumber]["marketState"][suit];
    if (suitMarketState["bidPlayer"] == username) {
      suitMarketState["bidPlayer"] = null;
      suitMarketState["bid"] = null;
    }
    if (suitMarketState["offerPlayer"] == username) {
      suitMarketState["offerPlayer"] = null;
      suitMarketState["offer"] = null;
    }
    broadcastMarketUpdate(roomNumber);
  });
}

// UPDATE FUNCTIONS
function shieldPlayerInfo(socketid, roomNumber) {
  let playerVisibleState = utils.deepCopy(
    roomToState[roomNumber]["playerState"]
  );
  let username = socketidToUsername[socketid];

  // hiding other player's hands
  Object.keys(playerVisibleState).map(player => {
    if (player != username) {
      suits.forEach(suit => {
        playerVisibleState[player][suit] = null;
      });
    }
  });

  return playerVisibleState;
}

function updatePlayers(roomNumber) {
  // first, get socketids associated with roomNumber
  let socketids = io.sockets.adapter.rooms[roomNumber].sockets;
  console.log("socketids: " + JSON.stringify(socketids));

  // for each socket in socketidToUsername, shield appropriately and socket.emit to that socket
  for (const socketid in socketids) {
    console.log("socketid: " + socketid);
    console.log("shielded info: " + shieldPlayerInfo(socketid, roomNumber));
    io.to(socketid).emit(
      "playerUpdate",
      shieldPlayerInfo(socketid, roomNumber)
    );
  }
}

function broadcastMarketUpdate(roomNumber) {
  let marketState = roomToState[roomNumber]["marketState"];
  io.to(roomNumber).emit("marketUpdate", marketState);
}

function updateGameState(state, roomNumber) {
  roomToState[roomNumber]["isGameActive"] = state;
  io.to(roomNumber).emit("gameStateUpdate", state);
}

// START AND END FUNCTIONS
function initializeRoom(roomNumber) {
  roomToState[roomNumber] = {};
  roomToState[roomNumber]["marketState"] = utils.deepCopy(initialMarketState);
  roomToState[roomNumber]["playerState"] = {};
  roomToState[roomNumber]["goalSuit"] = null;
  roomToState[roomNumber]["isGameActive"] = false;
  roomToState[roomNumber]["tradeLog"] = [];
}

function startGame(roomNumber, socket) {
  if (
    Object.keys(roomToState[roomNumber]["playerState"]).length !== 4) {
    return socket.emit("alert", "Not enough players!");
  } else if (roomToState[roomNumber]["isGameActive"]) {
    return socket.emit("alert", "Game already started!");
  }

  console.log("game starting..." + JSON.stringify(socketidToUsername));

  let common = utils.randomSuit();
  let goal = utils.otherColor(common);
  let eight = utils.randomSuit();
  while (eight == common) eight = utils.randomSuit();

  let remainingSuits = suits.filter(s => s != common && s != eight);

  let cards = Array(40);
  cards.fill(common, 0, 12);
  cards.fill(eight, 12, 20);
  cards.fill(remainingSuits[0], 20, 30);
  cards.fill(remainingSuits[1], 30, 40);

  console.log("preshuffle: " + cards);
  utils.shuffle(cards);

  console.log("goal: " + goal);
  console.log("cards: " + cards);
  roomToState[roomNumber]["goalSuit"] = goal;

  // distribute cards to players
  let cnt = 0;
  let playerState = roomToState[roomNumber]["playerState"];
  Object.keys(playerState).map(player => {
    let playerCards = cards.slice(cnt, cnt + 10);
    playerState[player]["money"] -= 50;

    suits.forEach(suit => {
      playerState[player][suit] = 0;
    });
    playerCards.forEach(card => {
      playerState[player][card] += 1;
    });
    cnt += 10;
  });
  clearMarket(roomNumber);
  updatePlayers(roomNumber);
  updateGameState(true, roomNumber);
  io.to(roomNumber).emit("alert", "Game on!");  // tell all players
}

function endGame(roomNumber, socket) {
  let playerState = roomToState[roomNumber]["playerState"];
  if (!roomToState[roomNumber]["isGameActive"]) return socket.emit("alert", 
                                                                   "Game not active!");

  updateGameState(false, roomNumber);

  // compute final rewards and emit to all clients for display
  let winners = [];
  let goalSuit = roomToState[roomNumber]["goalSuit"];
  let maxGoalSuit = 0;
  let numGoalSuitTotal = 0;
  let rewards = {};
  Object.keys(playerState).map(player => {
    let numGoalSuit = playerState[player][goalSuit];
    numGoalSuitTotal += numGoalSuit;
    rewards[player] = numGoalSuit * 10;
    if (numGoalSuit > maxGoalSuit) {
      winners = [player];
      maxGoalSuit = numGoalSuit;
    } else if (numGoalSuit == maxGoalSuit) {
      winners.push(player);
    }
  });

  // distribute remainder of pot equally to winners
  let remainder = 200 - numGoalSuitTotal * 10;
  let remainingRewards = utils.splitWinnings(remainder, winners.length);
  remainingRewards = utils.shuffle(remainingRewards);
  for (let i = 0; i < winners.length; i++) {
    let winner = winners[i];
    rewards[winner] += remainingRewards[i];
  }

  // TODO: make this an alert via return
  let msg =
    "goal: " + goalSuit + ", rewards: " + JSON.stringify(rewards, null, 1);

  let tradeLog = roomToState[roomNumber]["tradeLog"];
  tradeLog.unshift(msg);
  io.to(roomNumber).emit("tradeLogUpdate", tradeLog);

  // give out rewards and update persistent state
  Object.keys(playerState).map(async player => {
    playerState[player]["money"] += rewards[player];
    await fetch(`${server}/players/${player}/${playerState[player]["money"]}`, {
      method: "PUT"
    });
  });
  updatePlayers(roomNumber);
}

io.on("connection", async function(socket) {
  if (Object.keys(socketidToUsername).length == maxUsers) {
    console.log(
      "Reached maximum capacity, rejecting connection from " + socket.id
    );
    socket.emit("maxCapacity");
    socket.disconnect();
    return;
  }

  console.log("A user connected with socket id: " + socket.id);

  // join specific room
  socket.on("enterRoom", roomNumber => {
    if (!Object.keys(roomToState).includes(roomNumber)) {
      initializeRoom(roomNumber);
    }

    socket.join(roomNumber);
    socketidToRoomNumber[socket.id] = roomNumber;

    socket.emit("enteredRoom", roomNumber); // user data is added on provideUsername
  });

  // allow client to specify username
  socket.on("provideUsername", async username => {
    socketidToUsername[socket.id] = username;
    let roomNumber = socketidToRoomNumber[socket.id]; // assumes enterRoom was already received
    if (Object.keys(roomToState[roomNumber]["playerState"]).length == 4) {
      // room full
      // TODO: emit different message to client than full total capacity
      console.log("Room is full, rejecting connection from " + socket.id);
      socket.emit("maxCapacity");
      socket.disconnect();
      return;
    }

    if (roomToState[roomNumber]["isGameActive"]) {
      socket.emit("alert", "Game already active, cannot join!");
      socket.disconnect();
      return;
    }

    socketidToUsername[socket.id] = username;
    usernameToRoomNumber[username] = roomNumber;

    // initialize new player and add to db or retrieve persistent state
    roomToState[roomNumber]["playerState"][username] = utils.deepCopy(
      initialPlayerState
    );
    let money = await fetch(`${server}/players/${username}`);
    money = await money.json();
    if (money.length > 0) {
      roomToState[roomNumber]["playerState"][username]["money"] =
        money[0]["money"]; // populate from db
    } else {
      await fetch(`${server}/players/${username}`, {
        method: "POST"
      });
    }
    updatePlayers(roomNumber);
    broadcastMarketUpdate(roomNumber);
    socket.emit("username", username);
  });

  // on disconnection, server recycles the client username
  socket.on("disconnect", async function() {
    // TODO: be more careful about checking conditions
    console.log("user disconnected");
    let username = socketidToUsername[socket.id];
    let roomNumber = socketidToRoomNumber[socket.id];
    // usernames.push(username);
    console.log("roomToState: " + JSON.stringify(roomToState));
    console.log(
      "socket id to room number: " + JSON.stringify(socketidToRoomNumber)
    );
    delete socketidToUsername[socket.id];
    delete socketidToRoomNumber[socket.id];
    delete usernameToRoomNumber[username];
    if (roomToState[roomNumber] != null) {
      let playerState = roomToState[roomNumber]["playerState"];
      if (playerState[username] != null) {
        await fetch(
          `${server}/players/${username}/${playerState[username]["money"]}`,
          { method: "PUT" }
        );
        delete playerState[username];
      }
      if (Object.keys(playerState).length == 0) {
        delete roomToState[roomNumber];
      } else {
        updatePlayers(roomNumber);
      }
    }
  });

  // on client command, server parses the command
  socket.on("clientCommand", command => {
    console.log("server has received command: " + command);
    parseCommand(command, socket);
  });
});
