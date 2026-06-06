const path = require('path')

function viralDirectorDataDir(app) {
  return path.join(app.getPath('userData'), 'viral-director')
}

function viralDirectorStateFile(app) {
  return path.join(viralDirectorDataDir(app), 'state.json')
}

function viralDirectorUploadDir(app) {
  return path.join(viralDirectorDataDir(app), 'uploads')
}

module.exports = {
  viralDirectorDataDir,
  viralDirectorStateFile,
  viralDirectorUploadDir,
}
