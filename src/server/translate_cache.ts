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

import {Connection, TextDocuments} from 'vscode-languageserver';
import {
  Model,
  ModelMaterializer,
  Runtime,
  SerializedExplore,
} from '@malloydata/malloy';
import {TextDocument} from 'vscode-languageserver-textdocument';

import {ConnectionManager} from '../common/connection_manager';
import {BuildModelRequest, CellData} from '../common/types';

export class TranslateCache implements TranslateCache {
  cache = new Map<string, {model: Model; version: number}>();

  constructor(
    private documents: TextDocuments<TextDocument>,
    private connection: Connection,
    private connectionManager: ConnectionManager
  ) {
    connection.onRequest(
      'malloy/fetchModel',
      async (event: BuildModelRequest): Promise<SerializedExplore[]> => {
        const model = await this.translateWithCache(event.uri, event.version);
        return model.explores.map(explore => explore.toJSON());
      }
    );
  }

  async getDocumentText(
    documents: TextDocuments<TextDocument>,
    uri: URL
  ): Promise<string> {
    const cached = documents.get(uri.toString());
    if (cached) {
      return cached.getText();
    } else {
      /* eslint-disable-next-line no-console */
      console.info('fetchFile requesting', uri.toString());
      return await this.connection.sendRequest('malloy/fetchFile', {
        uri: uri.toString(),
      });
    }
  }

  async getCellData(uri: URL): Promise<CellData[]> {
    return await this.connection.sendRequest('malloy/fetchCellData', {
      uri: uri.toString(),
    });
  }

  async translateWithCache(
    uri: string,
    currentVersion: number
  ): Promise<Model> {
    const entry = this.cache.get(uri);
    if (entry && entry.version === currentVersion) {
      return entry.model;
    }

    const files = {
      readURL: (url: URL) => this.getDocumentText(this.documents, url),
    };
    const runtime = new Runtime(
      files,
      this.connectionManager.getConnectionLookup(new URL(uri))
    );

    let model: Model;

    if (uri.startsWith('vscode-notebook-cell:')) {
      const allCells = await this.getCellData(new URL(uri));
      let mm: ModelMaterializer | null = null;
      for (let idx = 0; idx < allCells.length; idx++) {
        const url = new URL(allCells[idx].uri);
        if (mm) {
          mm = mm.extendModel(url);
        } else {
          mm = runtime.loadModel(url);
        }
      }
      model = await mm.getModel();
    } else {
      model = await runtime.getModel(new URL(uri));
      this.cache.set(uri, {version: currentVersion, model});
    }
    return model;
  }
}
