const { loadJSON, saveJSON } = require("../utils/jsonStore");

const MESSAGES_FILE = "./world_messages.json";
let messages = loadJSON(MESSAGES_FILE, []);

const MAX_MESSAGES = 100;

function addMessage(msg) {
  messages.push(msg);
  if (messages.length > MAX_MESSAGES) messages.shift();
  saveJSON(MESSAGES_FILE, messages);
  return msg;
}

function resetChat() {
  messages = [];
  saveJSON(MESSAGES_FILE, messages);
}

module.exports = {
  messages,
  addMessage,
  resetChat
};
