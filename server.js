const express = require('express');
const path = require('path');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));
app.get('*', (req, res) => {
  const fs = require('fs');
  const pub = path.join(__dirname, 'public', 'index.html');
  res.sendFile(fs.existsSync(pub) ? pub : path.join(__dirname, 'index.html'));
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`POMS running on port ${PORT}`));
