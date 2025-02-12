var fs = require('fs');
var path = require('path');
var escapeStringRegexp = require('escape-string-regexp');
var extend = require('extend');

var UUE = function(){
   if (!(this instanceof UUE)) return new UUE();
};

UUE.prototype.encode = function(encodeSource, encodeOptions){
   /* jshint bitwise:false */
   var options = extend(
      {},
      { mode: null, filename: null, eol: null },
      encodeOptions
   );

   if( typeof encodeSource === 'string' ){ // treat as filename
      // check options.mode
      if( options.mode === null ){
         options.mode = (
            fs.statSync(encodeSource).mode & parseInt('777', 8)
         ).toString(8);
      } else if( typeof options.mode !== 'string' ){
         options.mode = options.mode.toString(8);
      }

      // check options.filename
      if( options.filename === null ){
         options.filename = path.basename(encodeSource);
      }

      // make encodeSource a buffer
      encodeSource = fs.readFileSync(encodeSource);
   } else if( Buffer.isBuffer(encodeSource) ){ // treat as buffer
      // check options.mode
      if( options.mode === null ){
         options.mode = '644';
      } else if( typeof options.mode !== 'string' ){
         options.mode = options.mode.toString(8);
      }

      // check options.filename
      if( options.filename === null ) options.filename = 'buffer.bin';
   } else throw new Error(this.errors.UNKNOWN_SOURCE_TYPE);

   if( options.eol === null ) options.eol = '\n';

   // now encodeSource is always a buffer
   var output = [];
   output.push('begin ');
   output.push(options.mode);
   output.push(' ');
   output.push(options.filename);
   output.push(options.eol);

   var offset = 0;
   while( offset < encodeSource.length ){
      var triplet, total, charCode;
      if( encodeSource.length - offset >= 45 ){ // complete line, 15 triplets
         output.push(String.fromCharCode(45 + 32));
         for( triplet = 0; triplet < 15; triplet++ ){
            total = 0;

            total += encodeSource.readUInt8(offset) << 16;
            offset++;
            total += encodeSource.readUInt8(offset) << 8;
            offset++;
            total += encodeSource.readUInt8(offset);
            offset++;

            charCode = total >>> 18;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));

            charCode = (total >>> 12) & 0x3F;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));

            charCode = (total >>> 6) & 0x3F;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));

            charCode = total & 0x3F;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));
         }
      } else { // last line, less than 15 triplets
         output.push(String.fromCharCode(encodeSource.length - offset + 32));
         var tripletNum = ( (encodeSource.length - offset) /3 ) |0;
         for( triplet = 0; triplet < tripletNum; triplet++ ){
            total = 0;

            total += encodeSource.readUInt8(offset) << 16;
            offset++;
            total += encodeSource.readUInt8(offset) << 8;
            offset++;
            total += encodeSource.readUInt8(offset);
            offset++;

            charCode = total >>> 18;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));

            charCode = (total >>> 12) & 0x3F;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));

            charCode = (total >>> 6) & 0x3F;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));

            charCode = total & 0x3F;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));
         }
         if( offset < encodeSource.length ){ // some bytes remain
            total = 0;

            total += encodeSource.readUInt8(offset) << 16;
            offset++;
            if( offset < encodeSource.length ){
               total += encodeSource.readUInt8(offset) << 8;
               offset++;
            }
            if( offset < encodeSource.length ){
               total += encodeSource.readUInt8(offset);
               offset++;
            }

            charCode = total >>> 18;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));

            charCode = (total >>> 12) & 0x3F;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));

            charCode = (total >>> 6) & 0x3F;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));

            charCode = total & 0x3F;
            if( charCode === 0 ) charCode = 64;
            output.push(String.fromCharCode(charCode + 32));
         }
      }
      output.push(options.eol);
   }

   output.push('`');
   output.push(options.eol);
   output.push('end');
   return output.join('');
};

UUE.prototype.decodeFile = function(text, filename){
   //console.log(`looking for ${filename} in...`);
   //console.log(text);

   var matches = [];
   var potentialUUE = RegExp(
      [
         '^begin [0-7]{3} ' + escapeStringRegexp(filename) + '\n',
         '(',
         '(?:[\x20-\x60]+\n)*', // allow garbage after significant characters
         ')',
         '(?:`| )?\n', // allow an empty line as well
         'end$'
      ].join(''),
      'gm'
   );

   //console.log(potentialUUE);

   var continueSearch = true;
   do {
      var nextMatch = potentialUUE.exec(text);
      //console.log('test', potentialUUE.test(text));
      //console.log('nextMatch ', potentialUUE.exec(text));
      if( nextMatch === null ){
         continueSearch = false;
      } else {
         matches.push(nextMatch);
      }
   } while( continueSearch );

   //console.log(`matches.length == ${matches.length}`);

   if( matches.length === 0 ) return null;

   var fileFound = null;
   matches.forEach(nextMatch => {
      if( fileFound !== null ) return;

      if( nextMatch[1].length < 1 ){
         fileFound = Buffer.alloc(0);
         return;
      }

      var decodingError = false;
      var decoded = nextMatch[1].split('\n');
      //console.log('FOO', JSON.stringify(decoded, null, 2));
      decoded.pop(); // cut last \n (it is not a separator)
      decoded = decoded.map(lineUUE => {

         /* jshint bitwise:false */
         if( decodingError ) return null;

         //console.log(`checking ${lineUUE}`);

         // Number of bytes in the line.
         var byteLength = (lineUUE.charCodeAt(0) - 32) % 64;

         //console.log(`  byteLength = ${byteLength}`);
         if( byteLength === 0 ) return Buffer.alloc(0);

         // Number of characters: 3 bytes --> 4 characters
         // Note the '|0' truncates the fractional part.
         var charLength = ( (byteLength / 3) |0 ) * 4;

         // Adjust for the last line.
         // The last line of the encoded data may not have
         // an exactly divisible-by-3 number of bytes. If
         // there are extra bytes left, pad by four chars
         // to accommodate padding bytes. (e.g., an extra
         // 1 byte will be padded by 2 padding bytes to
         // ensure we are able to output 4 encoded characters)
         if( byteLength % 3 !== 0 ) charLength += 4;

         //console.log(`  charLength = ${charLength}`);
         //console.log(`  lineUUE.length = ${lineUUE.length}`);

         // # of chars + 1 count byte + 1 newline
         // max length is 62: 1 count byte + 60 chars + 1 newline

         // Some uuencoded text is saved via a mechanism that strips
         // trailing ' ' characters from each line of data (e.g., a
         // text editor or some kind of text post-processor). Stripping
         // the trailing ' ' characters corrupts the uuencoded text.
         // Here, we try to fix those corrupted lines by adding back
         // the trailing ' ' characters.
         lineUUE = this.helpers.repairLineLength(lineUUE, charLength);

         // Sanity check: 1 count char + n data chars
         // should not be > entire line
         if( 1 + charLength > lineUUE.length ){
            //console.log(`${charLength} !== ${lineUUE.length}`);
            //console.log('got decoding error!');
            decodingError = true;
            return null;
         }
         var targetBuffer = Buffer.alloc(byteLength);

         var step, total;
         var stringOffset = 1;
         var bufferOffset = 0;
         for( step = 0; step < ( (charLength / 4) |0 ); step++ ){
            total = 0;

            total += ((lineUUE.charCodeAt(stringOffset) - 32) % 64) << 18;
            stringOffset++;
            total += ((lineUUE.charCodeAt(stringOffset) - 32) % 64) << 12;
            stringOffset++;
            total += ((lineUUE.charCodeAt(stringOffset) - 32) % 64) << 6;
            stringOffset++;
            total +=  (lineUUE.charCodeAt(stringOffset) - 32) % 64;
            stringOffset++;

            targetBuffer.writeUInt8( total >>> 16, bufferOffset );
            bufferOffset++;
            if (bufferOffset >= byteLength) break;
            targetBuffer.writeUInt8( (total >>> 8) & 0xFF, bufferOffset );
            bufferOffset++;
            if (bufferOffset >= byteLength) break;
            targetBuffer.writeUInt8( total & 0xFF, bufferOffset );
            bufferOffset++;
            if (bufferOffset >= byteLength) break;
         }
         return targetBuffer;
      });
      if( decodingError ) return;

      // now `decoded` is a valid array containing buffers,
      // because `null` could appear only in `decodingError` state
      fileFound = Buffer.concat(decoded);
   });

   return fileFound;
};

UUE.prototype.decodeAllFiles = function(text){
   var allFiles = [];
   var matches = [];
   var potentialUUE = RegExp(
      [ // detail-capturing version of the RegExp from `.split`
         '^begin [0-7]{3} (\\S(?:.*?\\S)?)\n',
         '(',
         '(?:[\x20-\x60]+\n)*', // allow garbage after significant characters
         ')',
         '(?:`| )?\n', // allow an empty line as well
         'end$'
      ].join(''),
      'gm'
   );

   var continueSearch = true;
   do {
      var nextMatch = potentialUUE.exec(text);
      if( nextMatch === null ){
         continueSearch = false;
      } else {
         matches.push(nextMatch);
      }
   } while( continueSearch );

   // console.log(`matches.length === ${matches.length}`);

   if( matches.length === 0 ) return [];

   matches.forEach(nextMatch => {
      var nextFilename = nextMatch[1];
      var idxFilename = allFiles.findIndex(
         nextFile => nextFile.name === nextFilename
      );
      if( idxFilename > -1 ) return; // already found, skip it

      if( nextMatch[2].length < 1 ){
         allFiles.push({
            name: nextFilename,
            data: Buffer.alloc(0)
         });
         return;
      }

      var decodingError = false;
      var decoded = nextMatch[2].split('\n');
      decoded.pop(); // cut last \n (it is not a separator)
      decoded = decoded.map(lineUUE => {
         /* jshint bitwise:false */
         if( decodingError ) return null;

         var byteLength = (lineUUE.charCodeAt(0) - 32) % 64;
         if( byteLength === 0 ) return Buffer.alloc(0);

         var charLength = ( (byteLength / 3) |0 ) * 4;
         if( byteLength % 3 !== 0 ) charLength += 4;

         lineUUE = this.helpers.repairLineLength(lineUUE, charLength);

         if( 1 + charLength > lineUUE.length ){
            //console.log('got decoding error');
            decodingError = true;
            return null;
         }
         var targetBuffer = Buffer.alloc(byteLength);

         var step, total;
         var stringOffset = 1;
         var bufferOffset = 0;
         for( step = 0; step < ( (charLength / 4) |0 ); step++ ){
            total = 0;

            total += ((lineUUE.charCodeAt(stringOffset) - 32) % 64) << 18;
            stringOffset++;
            total += ((lineUUE.charCodeAt(stringOffset) - 32) % 64) << 12;
            stringOffset++;
            total += ((lineUUE.charCodeAt(stringOffset) - 32) % 64) << 6;
            stringOffset++;
            total +=  (lineUUE.charCodeAt(stringOffset) - 32) % 64;
            stringOffset++;

            targetBuffer.writeUInt8( total >>> 16, bufferOffset );
            bufferOffset++;
            if (bufferOffset >= byteLength) break;
            targetBuffer.writeUInt8( (total >>> 8) & 0xFF, bufferOffset );
            bufferOffset++;
            if (bufferOffset >= byteLength) break;
            targetBuffer.writeUInt8( total & 0xFF, bufferOffset );
            bufferOffset++;
            if (bufferOffset >= byteLength) break;
         }
         return targetBuffer;
      });
      if( decodingError ) return;

      // now `decoded` is a valid array containing buffers,
      // because `null` could appear only in `decodingError` state
      allFiles.push({
         name: nextFilename,
         data: Buffer.concat(decoded)
      });
   });

   return allFiles;
};

UUE.prototype.split = function(text){
   var processUUE = this;
   var potentialUUE = RegExp(
      [ // entirely-capturing version of the RegExp from `.decodeAllFiles`
         '(',
         '^begin [0-7]{3} \\S(?:.*?\\S)?\n',
         '(?:[\x20-\x60]+\n)*', // allow garbage after significant characters
         '(?:`| )?\n', // allow an empty line as well
         'end$',
         ')'
      ].join(''),
      'gm'
   );
   return text.split(potentialUUE).map((fragment, idx, arr) => {
      /* jshint indent: false */
      if( idx % 2 === 0 ){ // simple string fragment's index: 0, 2, 4...
         return fragment;
      } else { // regex-captured fragment's index: 1, 3, 5...
         var decodedFiles = processUUE.decodeAllFiles(fragment);
         switch( decodedFiles.length ){
            case 0:
               // incorrect UUE, append to the previous (always text) fragment
               arr[idx-1] += fragment;
               return null;
            //break;
            case 1:
               // correct UUE
               decodedFiles[0].source = fragment;
               decodedFiles[0].type = 'UUE';
               return decodedFiles[0];
            //break;
            default: throw new Error(
               processUUE.errors.UNEXPECTED_NUMBER_OF_FILES
            );
         }
      }
   }).filter(nextElement => {
      if( nextElement === '' ) return false;
      if( nextElement === null ) return false;

      return true;
   }).reduce((builtArray, nextFragment) => {
      if( typeof nextFragment !== 'string' ){
         builtArray.push(nextFragment);
      } else { // typeof nextFragment === 'string'
         if(
            builtArray.length > 0 &&
            typeof builtArray[builtArray.length - 1] === 'string'
         ){ // the array's last element is also a string; appending:
            builtArray[builtArray.length - 1] += nextFragment;
         } else {
            builtArray.push(nextFragment);
         }
      }
      return builtArray;
   }, []);
};

UUE.prototype.helpers = {
   repairLineLength: function(lineUUE, expectedCharLength) {
      var hasNewline = /\n$/.test(lineUUE);
      var repairedLineUUE = lineUUE;

      // cut off ending newline
      if (hasNewline) {
         repairedLineUUE = lineUUE.slice(0, -1);
      }

      // pad line with spaces to achieve correct length
      // note that this is expectedCharLength + 1, where the "+ 1" is for
      // the count character at the beginning of line.
      repairedLineUUE = repairedLineUUE.padEnd(expectedCharLength + 1, ' ');

      // add newline back
      if (hasNewline) {
         repairedLineUUE = `${repairedLineUUE}\n`;
      }

      return repairedLineUUE;
   }
};

UUE.prototype.errors = {
   UNKNOWN_SOURCE_TYPE: "The source's type is unknown!",
   UNEXPECTED_NUMBER_OF_FILES: "Unexpected number of files in a fragment!"
};

module.exports = new UUE();
