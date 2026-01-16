const players = {};

function createPlayer(id) {
  players[id] = {
    id,
    x: 0,
    y: 1,
    z: 0,
    rotation: 0,
    username: "Player",
    skinColor: 0xFFFF00,
    torsoColor: 0x0000FF,
    legsColor: 0x00FF00,
    animation: "idle",
    walking: false,
    velocityY: 0,
    isAdmin: false
  };
  return players[id];
}

function removePlayer(id) {
  delete players[id];
}

module.exports = {
  players,
  createPlayer,
  removePlayer
};
