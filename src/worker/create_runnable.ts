/*
 * Copyright 2023 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files
 * (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software,
 * and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {
  ModelMaterializer,
  QueryMaterializer,
  Runtime,
  SQLBlockMaterializer,
} from '@malloydata/malloy';
import {WorkerQuerySpec} from '../common/worker_message_types';
import {FileHandler} from '../common/types';

export const createRunnable = async (
  query: WorkerQuerySpec,
  runtime: Runtime,
  fileHandler: FileHandler
): Promise<SQLBlockMaterializer | QueryMaterializer> => {
  let runnable: QueryMaterializer | SQLBlockMaterializer;
  const queryFileURL = new URL(query.uri);
  let mm: ModelMaterializer | null = null;
  if (queryFileURL.protocol === 'vscode-notebook-cell:') {
    const allCells = await fileHandler.fetchCellData(query.uri);
    for (let idx = 0; idx < allCells.length; idx++) {
      const url = new URL(allCells[idx].uri);
      if (mm) {
        mm = mm.extendModel(url);
      } else {
        mm = runtime.loadModel(url);
      }
    }
  } else {
    mm = runtime.loadModel(queryFileURL);
  }
  switch (query.type) {
    case 'string':
      runnable = mm.loadQuery(query.text);
      break;
    case 'named':
      runnable = mm.loadQueryByName(query.name);
      break;
    case 'file':
      if (query.index === -1) {
        runnable = mm.loadFinalQuery();
      } else {
        runnable = mm.loadQueryByIndex(query.index);
      }
      break;
    case 'named_sql':
      runnable = mm.loadSQLBlockByName(query.name);
      break;
    case 'unnamed_sql':
      runnable = mm.loadSQLBlockByIndex(query.index);
      break;
    default:
      throw new Error('Internal Error: Unexpected query type');
  }
  return runnable;
};
