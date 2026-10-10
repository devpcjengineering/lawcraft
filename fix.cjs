const fs = require('fs');
['public/js/attachments.js', 'public/js/app.js'].forEach(file => {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/\\`/g, '`').replace(/\\\$/g, '$');
  fs.writeFileSync(file, code);
});
