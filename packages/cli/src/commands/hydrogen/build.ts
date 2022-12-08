import path from 'path';
import * as remix from '@remix-run/dev/dist/compiler.js';
import fsExtra from 'fs-extra';
import {output} from '@shopify/cli-kit';
import colors from '@shopify/cli-kit/node/colors';
import {getProjectPaths, getRemixConfig} from '../../utils/config.js';
import {flags} from '../../utils/flags.js';

import Command from '@shopify/cli-kit/node/base-command';
import {Flags} from '@oclif/core';

const LOG_WORKER_BUILT = '📦 Worker built';

// @ts-ignore
export default class Build extends Command {
  static description = 'Builds a Hydrogen storefront for production';
  static flags = {
    ...flags,
    sourcemap: Flags.boolean({
      env: 'SHOPIFY_HYDROGEN_FLAG_SOURCEMAP',
    }),
    entry: Flags.string({
      env: 'SHOPIFY_HYDROGEN_FLAG_SOURCEMAP',
      required: true,
    }),
    minify: Flags.boolean({
      description: 'Minify the build output',
      env: 'SHOPIFY_HYDROGEN_FLAG_MINIFY',
    }),
  };

  async run(): Promise<void> {
    // @ts-ignore
    const {flags} = await this.parse(Build);
    const directory = flags.path ? path.resolve(flags.path) : process.cwd();

    await runBuild({...flags, path: directory});
  }
}

export async function runBuild({
  entry,
  sourcemap = true,
  path: appPath,
}: {
  entry: string;
  sourcemap?: boolean;
  path?: string;
}) {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
  }

  const {
    root,
    entryFile,
    buildPath,
    buildPathClient,
    buildPathWorkerFile,
    publicPath,
  } = getProjectPaths(appPath, entry);

  console.time(LOG_WORKER_BUILT);
  const remixConfig = await getRemixConfig(root, entryFile, publicPath);
  await fsExtra.rm(buildPath, {force: true, recursive: true});

  output.info(`\n🏗️  Building in ${process.env.NODE_ENV} mode...`);

  await Promise.all([
    copyPublicFiles(publicPath, buildPathClient),
    remix.build(remixConfig, {
      mode: process.env.NODE_ENV as any,
      sourcemap,
      onBuildFailure: (failure: Error) => {
        remix.formatBuildFailure(failure);
        // Stop here and prevent waterfall errors
        throw Error();
      },
    }),
  ]);

  if (process.env.NODE_ENV !== 'development') {
    console.timeEnd(LOG_WORKER_BUILT);
    const {size} = await fsExtra.stat(buildPathWorkerFile);
    const sizeMB = size / (1024 * 1024);

    output.info(
      output.content`   ${colors.dim(
        path.relative(root, buildPathWorkerFile),
      )}  ${output.token.yellow(sizeMB.toFixed(2))} MB\n`,
    );

    if (sizeMB >= 1) {
      output.warn(
        '🚨 Worker bundle exceeds 1 MB! This can delay your worker response.\n',
      );
    }
  }
}

export function copyPublicFiles(publicPath: string, buildPathClient: string) {
  return fsExtra.copy(publicPath, buildPathClient, {
    recursive: true,
    overwrite: true,
  });
}
