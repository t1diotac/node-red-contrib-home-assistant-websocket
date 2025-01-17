const EntityNode = require('../EntityNode');
const {
    STATUS_SHAPE_RING,
    STATUS_COLOR_BLUE,
} = require('../../helpers/status');

const OUTPUT_TYPE_INPUT = 'input';
const OUTPUT_TYPE_STATE_CHANGE = 'state change';

const nodeOptions = {
    config: {
        outputOnStateChange: {},
        outputPayload: {},
        outputPayloadType: {},
    },
};

class Switch extends EntityNode {
    constructor({ node, config, RED, status }) {
        super({ node, config, RED, status, nodeOptions });

        this.status.init({
            nodeState: this.isEnabled,
            homeAssistant: this.homeAssistant,
        });
    }

    onHaEventMessage(evt) {
        const stateChanged =
            evt.type === 'state_changed' && evt.state !== this.isEnabled;
        super.onHaEventMessage(evt);
        if (stateChanged && this.nodeConfig.outputOnStateChange) {
            // fake a HA entity
            const entity = {
                state: this.isEnabled,
            };
            let payload;
            try {
                payload = this.getTypedInputValue(
                    this.nodeConfig.outputPayload,
                    this.nodeConfig.outputPayloadType,
                    { entity }
                );
            } catch (e) {
                this.status.setFailed('Error');
                this.node.error(`JSONata Error: ${e.message}`, {});
                return;
            }

            const msg = {
                payload,
                outputType: OUTPUT_TYPE_STATE_CHANGE,
            };
            const opts = [msg, null];
            const statusMessage = msg.payload || 'state change';
            const status = {
                fill: STATUS_COLOR_BLUE,
                text: this.status.appendDateString(statusMessage),
            };
            if (this.isEnabled) {
                this.send(opts);
            } else {
                status.shape = STATUS_SHAPE_RING;
                this.send(opts.reverse());
            }
            this.status.set(status);
        }
    }

    onInput({ message, send, done }) {
        if (typeof message.enable === 'boolean') {
            this.isEnabled = message.enable;
            this.updateHomeAssistant();
            done();
            return;
        }

        message.outputType = OUTPUT_TYPE_INPUT;
        const output = [message, null];
        const statusMessage = message.payload || OUTPUT_TYPE_INPUT;
        if (this.isEnabled) {
            this.status.setSuccess(statusMessage);
            send(output);
        } else {
            this.status.setFailed(statusMessage);
            send(output.reverse());
        }
    }

    handleTriggerMessage(data = {}) {
        const msg = {
            topic: 'triggered',
            payload: data.payload,
        };

        if (this.isEnabled) {
            this.status.setSuccess('triggered');
            this.send([msg, null]);
        } else {
            this.status.setFailed('triggered');
            this.send([null, msg]);
        }
    }
}

module.exports = Switch;
