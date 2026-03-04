import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';

import { createEndrCreateServiceAction } from './actions/create-service';
import { createEndrLoadOptionsAction } from './actions/load-options';

export { createEndrCreateServiceAction, createEndrLoadOptionsAction };

const scaffolderModuleEndr = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'endr-actions',
  register(reg) {
    reg.registerInit({
      deps: {
        logger: coreServices.logger,
        scaffolder: scaffolderActionsExtensionPoint
      },
      async init({ logger, scaffolder }) {
        scaffolder.addActions(createEndrLoadOptionsAction(), createEndrCreateServiceAction());
        logger.info('Registered ENDR scaffolder actions: endr:load-options, endr:create-service');
      }
    });
  }
});

export default scaffolderModuleEndr;

