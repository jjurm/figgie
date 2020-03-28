## Figgie

Multiplayer Figgie built using React, express, and socket.io

[figgie.io](figgie.io)

# TODO

Style:

- leaderboard should be centered

## functionality

Ideal flow:

- lobby:

  - can play as a guest
  - see list of rooms w/ info and have it update
  - support private rooms by adding in optional pw to room creation
  - can spectate active games
  - can observe full rooms, and join if it becomes unfull
  - leaderboard bug (render executes before componentWillMount finishes)

- game room:

  - people can chat --> this merges with trade-log 
  - clean up updatePlayersList v. updatePlayersInfo 

* logging & robustness
  - automated tests? (UI flow tests via puppeteer?)
  - [done-ish] metrics (GA)
    - daily active users, avg minutes/session, avg games/session, etc.
  - unclear what to do with logging, but ideally server side logs should tell us about bugs and help us debug
  - split larger files into smaller components, have one person own each file (for documentation & understanding)

starting from fresh:
A, B, C, D join room 1

- everyone sees:

  - ready check
  - [chat]
  - trade log
  - rules

  - if anyone leaves and joins, they see same thing

Everyone is ready, game starts.

- everyone sees:

  - market
  - trade log
  - rules
  - [chat]

  - if D leaves, A,B,C see D greyed out but everything else the same
  - if D rejoins, he sees what he saw before
  - E cannot join

Game ends

- everyone sees:

  - trade log
  - results
  - show player's names A,B,C,D

  - if D leaves, A,B,C see same results but no player name D
  - if D rejoins, everyone sees updated names. D still sees results

  - if D leaves and E joins, everyone see updated names. E doesn't see results

## Deployment

To deploy on aws:

- install node
- git clone repo
- npm install
- npm run build
- **make sure ENV=production!**
- **make sure all IP addresses in code match server ip (http://3.22.23.96/)**
- install serve and pm2
- make sure postgres is installed and configured (database `players`)
- `pm2 start server.js --watch` to start backend server and watch changes
- `pm2 save && pm2 startup`, then run the code returned by pm2 startup, to auto restart server on machine restart. You can test server is running with `IP:8080/players`
  - `pm2 logs` to see logs
- `sudo serve -s build -l 80` on a tmux window in background to run client-facing server

To update:

- `git pull`
- `npm run build` to rebuild
- You _may_ have to restart the backend server via `pm2 restart all`

## postgres

https://blog.logrocket.com/setting-up-a-restful-api-with-node-js-and-postgresql-d96d6fc892d8

- psql -d postgres -U me
- \c api
- select \* from players;
