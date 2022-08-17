import { NodeMessage, NodeMessageInFlow } from 'node-red';

import { RED } from '../../globals';
import { BaseNode, NodeSend, OutputProperty } from '../../types/nodes';
import NodeRedContextService from '../services/NodeRedContextService';
import TypedInputService from '../services/TypedInputService';
import { Status } from '../status/Status';

export interface OutputControllerOptions<T> {
    nodeRedContextService: NodeRedContextService;
    node: T;
    status: Status;
    typedInputService: TypedInputService;
}

// export default abstract class OutputController<T extends BaseNode> {
export default abstract class OutputController<T extends BaseNode = BaseNode> {
    // TODO: create a state machine for this
    private _enabled = true;

    protected readonly contextService: NodeRedContextService;
    protected readonly node: T;
    protected readonly status: Status;
    protected readonly typedInputService: TypedInputService;

    constructor({
        nodeRedContextService,
        node,
        status,
        typedInputService,
    }: OutputControllerOptions<T>) {
        this.contextService = nodeRedContextService;
        this.node = node;
        this.status = status;
        this.typedInputService = typedInputService;

        node.on('close', this.preOnClose.bind(this));

        const name = this.node?.config?.name ?? 'undefined';
        node.debug(`instantiated node, name: ${name}`);
    }

    protected onClose?(removed: boolean, done?: (err?: Error) => void): void;

    get isEnabled() {
        return this._enabled;
    }

    set isEnabled(value) {
        this._enabled = !!value;
        this.status.setNodeState(this._enabled);
    }

    protected sendSplit(
        message: Partial<NodeMessageInFlow>,
        data: any[],
        send: NodeSend
    ) {
        if (!send) {
            send = this.node.send;
        }

        delete message._msgid;
        message.parts = {
            id: RED.util.generateId(),
            count: data.length,
            index: 0,
            // TODO: check if this works
            // type: 'array',
            // len: 1,
        };

        let pos = 0;
        for (let i = 0; i < data.length; i++) {
            message.payload = data.slice(pos, pos + 1)[0];
            if (message.parts) {
                message.parts.index = i;
            }
            pos += 1;
            send(RED.util.cloneMessage(message));
        }
    }

    // Hack to get around the fact that node-red only sends warn / error to the debug tab
    protected debugToClient(message: any | any[]) {
        if (!this.node.config.debugenabled) return;
        if (Array.isArray(message)) {
            message.forEach((msg) => this.node.debug(msg));
        } else {
            const debug = {
                id: this.node.id,
                path: `${this.node.z}/${this.node.id}`,
                name: this.node.name ?? '',
                message,
            };
            RED.comms.publish('debug', debug, false);
        }
    }

    protected setCustomOutputs(
        properties: OutputProperty[] = [],
        message: NodeMessage,
        extras: Record<string, any>
    ) {
        properties.forEach((item) => {
            const value = this.typedInputService.getValue(
                item.value,
                item.valueType,
                {
                    message,
                    ...extras,
                }
            );

            try {
                this.contextService.set(
                    value,
                    item.propertyType,
                    item.property,
                    message
                );
            } catch (e) {
                this.node.warn(
                    `Custom Ouput Error (${item.propertyType}:${item.property}): ${e}`
                );
            }
        });
    }

    private preOnClose(removed: boolean, done: () => void) {
        this.node.debug(
            `closing node. Reason: ${
                removed ? 'node deleted' : 'node re-deployed'
            }`
        );
        try {
            this.onClose?.(removed);
            done();
        } catch (e) {
            this.node.error(e);
        }
    }
}
