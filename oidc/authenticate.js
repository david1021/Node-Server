import { Provider } from 'oidc-provider'
import configuration from './support/configuration.js';

const oidc = new Provider('http://localhost:4000', configuration);

// or just expose a server standalone, see /examples/standalone.js
const server = oidc.listen(4000, () => {
    console.log(
        'oidc-provider listening on port 4000, check http://localhost:4000/.well-known/openid-configuration',
    )
})