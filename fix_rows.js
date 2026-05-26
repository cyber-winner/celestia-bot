const fs = require('fs');

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = dir + '/' + file;
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory() && !fullPath.includes('node_modules')) results = results.concat(walkDir(fullPath));
        else if (fullPath.endsWith('.js')) results.push(fullPath);
    });
    return results;
}

const files = walkDir('/home/cyber/CODES/CELESTIA/celestia-bot');
let changedCount = 0;
for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    content = content.replace(/components:\s*\[\s*container\s*,\s*row\s*\]/g, 'components: [container.addActionRowComponents(row)]');
    content = content.replace(/components:\s*\[\s*container\s*,\s*selectRow\s*\]/g, 'components: [container.addActionRowComponents(selectRow)]');
    content = content.replace(/components:\s*\[\s*container\s*,\s*buyRow\s*,\s*pagRow\s*\]/g, 'components: [container.addActionRowComponents(buyRow).addActionRowComponents(pagRow)]');
    content = content.replace(/const components = \[container\];\s*if \(detailButtons\) components\.push\(detailButtons\);\s*components\.push\(pagination\);/g, 'if (detailButtons) container.addActionRowComponents(detailButtons);\n        container.addActionRowComponents(pagination);\n        const components = [container];');
    
    // gift.js has: components: [container.addActionRowComponents(typeRow)] or [container, itemsRow]
    content = content.replace(/components:\s*\[\s*container\s*,\s*typeRow\s*\]/g, 'components: [container.addActionRowComponents(typeRow)]');
    content = content.replace(/components:\s*\[\s*container\s*,\s*itemRow\s*\]/g, 'components: [container.addActionRowComponents(itemRow)]');

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log('Fixed:', file);
        changedCount++;
    }
}
console.log('Total fixed:', changedCount);
