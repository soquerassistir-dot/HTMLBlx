const { loadJSON, saveJSON } = require("../utils/jsonStore");

const BLOCKS_FILE = "./world_blocks.json";
let blocks = loadJSON(BLOCKS_FILE, []);

function addBlock(block) {
  blocks.push(block);
  saveJSON(BLOCKS_FILE, blocks);
  return block;
}

function removeBlock(id) {
  blocks = blocks.filter(b => b.id !== id);
  saveJSON(BLOCKS_FILE, blocks);
}

function resetWorld() {
  blocks = [];
  saveJSON(BLOCKS_FILE, blocks);
}

module.exports = {
  blocks,
  addBlock,
  removeBlock,
  resetWorld
};
