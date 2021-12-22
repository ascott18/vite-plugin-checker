import { parentPort, workerData } from 'worker_threads'

import { Checker } from '../../Checker'
import { DiagnosticOptions, diagnostics } from './diagnostics'

import type { CreateDiagnostic } from '../../types'

export const createDiagnostic: CreateDiagnostic<'vls'> = (pluginConfig) => {
  let overlay = true // Vite defaults to true

  return {
    config: ({ hmr }) => {
      const viteOverlay = !(typeof hmr === 'object' && hmr.overlay === false)

      if (pluginConfig.overlay === false || !viteOverlay) {
        overlay = false
      }
    },
    async configureServer({ root }) {
      const workDir: string = root
      const errorCallback: DiagnosticOptions['errorCallback'] = (diagnostics, overlayErr) => {
        if (!overlay) return
        if (!overlayErr) return

        parentPort?.postMessage({
          type: 'ERROR',
          payload: {
            type: 'error',
            err: overlayErr,
          },
        })
      }

      const vlsConfig = workerData?.checkerConfig?.vls;
      await diagnostics(workDir, 'WARN', { 
        errorCallback,
        watch: true, 
        verbose: false, 
        config: typeof (vlsConfig) === "object" ? vlsConfig : undefined })
    },
  }
}

export class VlsChecker extends Checker<'vls'> {
  public constructor() {
    super({
      name: 'vls',
      absFilePath: __filename,
      build: {
        buildBin: (config) => {
          if (typeof config.vls === 'object') {

            return ['vite-plugin-checker-vls', [
              'diagnostics', 
              '--checker-config',
              // Escape quotes so that the system shell doesn't strip them out:
              '"' + JSON.stringify(config.vls).replace(/[\\"]/g, "\\$&") + '"'
            ]]
          }

          return ['vite-plugin-checker-vls', ['diagnostics']]
        },
      },
      createDiagnostic,
    })
  }

  public init() {
    const createServeAndBuild = super.initMainThread()
    module.exports.createServeAndBuild = createServeAndBuild

    super.initWorkerThread()
  }
}

const vlsChecker = new VlsChecker()
vlsChecker.prepare()
vlsChecker.init()
