const fs = require('fs');
const path = require('path');

const uploadsDirInRoutes = path.resolve(__dirname, '../src/routes', '../../uploads/products');
const uploadsDirInDist = path.resolve(__dirname, '../dist/routes', '../../uploads/products');
const uploadsDirInIndex = path.resolve(__dirname, '../src', '../uploads/products');
const uploadsDirInDistIndex = path.resolve(__dirname, '../dist', '../uploads/products');

console.log('uploadsDirInRoutes:', uploadsDirInRoutes);
console.log('uploadsDirInDist:', uploadsDirInDist);
console.log('uploadsDirInIndex:', uploadsDirInIndex);
console.log('uploadsDirInDistIndex:', uploadsDirInDistIndex);
