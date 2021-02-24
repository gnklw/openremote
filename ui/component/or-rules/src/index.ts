import {css, customElement, html, LitElement, property, query, unsafeCSS} from "lit-element";
import manager, {
    AssetModelUtil,
    DefaultBoxShadow,
    DefaultColor1,
    DefaultColor2,
    DefaultColor3,
    DefaultColor4,
    DefaultColor5,
    DefaultColor6,
    Util
} from "@openremote/core";
import i18next from "i18next";
import "@openremote/or-icon";
import {
    AssetDescriptor,
    AssetQuery,
    AssetTypeInfo,
    AttributeDescriptor,
    ClientRole,
    JsonRule,
    LogicGroup,
    NotificationTargetType,
    RuleActionUnion,
    RuleCondition,
    RulesetLang,
    RulesetUnion,
    WellknownAssets
} from "@openremote/model";
import "@openremote/or-translate";
import "@openremote/or-mwc-components/dist/or-mwc-drawer";
import {translate} from "@openremote/or-translate";
import "./or-rule-list";
import "./or-rule-viewer";
import "./flow-viewer/flow-viewer";
import {OrRuleList} from "./or-rule-list";
import {OrRuleViewer} from "./or-rule-viewer";
import {RecurrenceOption} from "./json-viewer/or-rule-then-otherwise";
import {ValueInputProviderGenerator} from "@openremote/or-input";
import {showOkCancelDialog} from "@openremote/or-mwc-components/dist/or-mwc-dialog";

export const enum ConditionType {
    ASSET_QUERY = "assetQuery",
    TIMER = "timer"
}

export const enum ActionType {
    WAIT = "wait",
    EMAIL = "email",
    PUSH_NOTIFICATION = "push",
    ATTRIBUTE = "attribute"
}

export import ActionTargetType = NotificationTargetType;

export enum AssetQueryOperator {
    VALUE_EMPTY = "empty",
    VALUE_NOT_EMPTY = "notEmpty",
    EQUALS = "equals",
    NOT_EQUALS = "notEquals",
    GREATER_THAN = "greaterThan",
    GREATER_EQUALS = "greaterEquals",
    LESS_THAN = "lessThan",
    LESS_EQUALS = "lessEquals",
    BETWEEN = "between",
    NOT_BETWEEN = "notBetween",
    CONTAINS = "contains",
    NOT_CONTAINS = "notContains",
    STARTS_WITH = "startsWith",
    NOT_STARTS_WITH = "notStartsWith",
    ENDS_WITH = "endsWith",
    NOT_ENDS_WITH = "notEndsWith",
    CONTAINS_KEY = "containsKey",
    NOT_CONTAINS_KEY = "notContainsKey",
    INDEX_CONTAINS = "indexContains",
    NOT_INDEX_CONTAINS = "notIndexContains",
    LENGTH_EQUALS = "lengthEquals",
    NOT_LENGTH_EQUALS = "notLengthEquals",
    LENGTH_GREATER_THAN = "lengthGreaterThan",
    LENGTH_LESS_THAN = "lengthLessThan",
    IS_TRUE = "true",
    IS_FALSE = "false",
    WITHIN_RADIUS = "withinRadius",
    OUTSIDE_RADIUS = "outsideRadius",
    WITHIN_RECTANGLE = "withinRectangle",
    OUTSIDE_RECTANGLE = "outsideRectangle"
}

export interface AllowedActionTargetTypes {
    default?: ActionTargetType[];
    actions?: {[actionType in ActionType]?: ActionTargetType[]};
}

export interface RulesConfig {
    controls?: {
        allowedLanguages?: RulesetLang[];
        allowedConditionTypes?: ConditionType[];
        allowedActionTypes?: ActionType[];
        allowedAssetQueryOperators?: {[name: string]: AssetQueryOperator[]}; // name can be value descriptor name or value descriptor jsonType
        allowedRecurrenceOptions?: RecurrenceOption[];
        allowedActionTargetTypes?: AllowedActionTargetTypes;
        hideActionTypeOptions?: boolean;
        hideActionTargetOptions?: boolean;
        hideActionUpdateOptions?: boolean;
        hideConditionTypeOptions?: boolean;
        hideThenAddAction?: boolean;
        hideWhenAddCondition?: boolean;
        hideWhenAddAttribute?: boolean;
        hideWhenAddGroup?: boolean;
        multiSelect?: boolean;
    };
    inputProvider?: ValueInputProviderGenerator;
    descriptors?: {
        all?: RulesDescriptorSection;
        when?: RulesDescriptorSection;
        action?: RulesDescriptorSection;
    };
    rulesetAddHandler?: (ruleset: RulesetUnion) => boolean;
    rulesetDeleteHandler?: (ruleset: RulesetUnion) => boolean;
    rulesetCopyHandler?: (ruleset: RulesetUnion) => boolean;
    rulesetSaveHandler?: (ruleset: RulesetUnion) => boolean;
    json?: {
        rule?: JsonRule;
        whenGroup?: LogicGroup<RuleCondition>;
        whenCondition?: RuleCondition;
        whenAssetQuery?: AssetQuery;
        then?: RuleActionUnion;
        otherwise?: RuleActionUnion;
    };
}

export interface RulesDescriptorSection {
    includeAssets?: string[];
    excludeAssets?: string[];
    attributeDescriptors?: {[attributeName: string]: RulesConfigAttribute };
    /**
     * Asset type specific config; '*' key will be used as a default fallback if no asset type specific entry exists
     */
    assets?: { [assetType: string]: RulesConfigAsset };
}

export interface RulesConfigAsset {
    includeAttributes?: string[];
    excludeAttributes?: string[];
    name?: string;
    icon?: string;
    color?: string;
    attributeDescriptors?: {[attributeName: string]: RulesConfigAttribute };
}

export interface RulesConfigAttribute extends AttributeDescriptor {
}

export interface RulesetNode {
    ruleset: RulesetUnion;
    selected: boolean;
}

export interface RequestEventDetail<T> {
    allow: boolean;
    detail: T;
}

export interface RuleView {
    validate: () => boolean;
    beforeSave: () => void;
    ruleset?: RulesetUnion;
    readonly?: boolean;
    config?: RulesConfig;
}

function getAssetDescriptorFromSection(assetType: string, config: RulesConfig | undefined, useActionConfig: boolean): RulesConfigAsset | undefined {
    if (!config || !config.descriptors) {
        return;
    }

    const section = useActionConfig ? config.descriptors.action : config.descriptors.when;
    const allSection = config.descriptors.all;

    const descriptor = section && section.assets ? section.assets[assetType] ? section.assets[assetType] : section.assets["*"] : undefined;
    if (descriptor) {
        return descriptor;
    }

    return allSection && allSection.assets ? allSection.assets[assetType] ? allSection.assets[assetType] : allSection.assets["*"] : undefined;
}

export function getAssetTypeFromQuery(query?: AssetQuery): string | undefined {
    return query && query.types && query.types.length > 0 && query.types[0] ? query.types[0] : undefined;
}

export function getAssetIdsFromQuery(query?: AssetQuery) {
    return query && query.ids ? [...query.ids] : undefined;
}

export const getAssetTypes = async () => {
    // RT: Change to just get all asset types for now as if an instance of a particular asset doesn't exist you
    // won't be able to create a rule for it (e.g. if no ConsoleAsset in a realm then cannot create a console rule)
    return AssetModelUtil.getAssetTypeInfos().filter((ati) => ati.assetDescriptor!.name !== WellknownAssets.UNKNOWNASSET).map(ati => ati.assetDescriptor!.name!);
    // const response = await manager.rest.api.AssetResource.queryAssets({
    //     select: {
    //         excludeAttributes: true,
    //         excludeParentInfo: true,
    //         excludePath: true
    //     },
    //     tenant: {
    //         realm: manager.displayRealm
    //     },
    //     recursive: true
    // });
    //
    // if (response && response.data) {
    //     return response.data.map(asset => asset.type!);
    // }
}

export function getAssetInfos(config: RulesConfig | undefined, useActionConfig: boolean): Promise<AssetTypeInfo[]> {
    const assetDescriptors: AssetDescriptor[] = AssetModelUtil.getAssetDescriptors();

    return getAssetTypes().then(availibleAssetTypes => {
        let allowedAssetTypes: string[] = availibleAssetTypes ? availibleAssetTypes : [];
        let excludedAssetTypes: string[] = [];
        if (!config || !config.descriptors) {
            return assetDescriptors.map((ad) => AssetModelUtil.getAssetTypeInfo(ad)!);
        }

        const section = useActionConfig ? config.descriptors.action : config.descriptors.when;

        if ((section && section.includeAssets) || (config.descriptors.all && config.descriptors.all.includeAssets)) {
            allowedAssetTypes = [];

            if (section && section.includeAssets) {
                allowedAssetTypes = [...section.includeAssets];
            }

            if (config.descriptors.all && config.descriptors.all.includeAssets) {
                allowedAssetTypes = [...config.descriptors.all.includeAssets];
            }
        }

        if (section && section.excludeAssets) {
            excludedAssetTypes = [...section.excludeAssets];
        }
        if (config.descriptors.all && config.descriptors.all.excludeAssets) {
            excludedAssetTypes = excludedAssetTypes.concat(config.descriptors.all.excludeAssets);
        }

        return assetDescriptors.filter((ad) => {
            if (allowedAssetTypes.length > 0 && allowedAssetTypes.indexOf(ad.name!) < 0) {
                return false;
            }
            return excludedAssetTypes.indexOf(ad.name!) < 0;

        }).map((ad) => {

            let typeInfo = AssetModelUtil.getAssetTypeInfo(ad)!;

            // Amalgamate matching descriptor from config if defined
            const configDescriptor = getAssetDescriptorFromSection(ad.name!, config, useActionConfig);
            if (!configDescriptor) {
                return typeInfo;
            }

            const modifiedTypeInfo: AssetTypeInfo = {
                assetDescriptor: typeInfo.assetDescriptor ? {...typeInfo.assetDescriptor} : {descriptorType: "asset"},
                attributeDescriptors: typeInfo.attributeDescriptors ? [...typeInfo.attributeDescriptors] : [],
                metaItemDescriptors: typeInfo.metaItemDescriptors ? [...typeInfo.metaItemDescriptors] : [],
                valueDescriptors: typeInfo.valueDescriptors ? [...typeInfo.valueDescriptors] : []
            };

            if (configDescriptor.icon) {
                modifiedTypeInfo.assetDescriptor!.icon = configDescriptor.icon;
            }
            if (configDescriptor.color) {
                modifiedTypeInfo.assetDescriptor!.colour = configDescriptor.color;
            }

            // Remove any excluded attributes
            if (modifiedTypeInfo.attributeDescriptors) {
                const includedAttributes = configDescriptor.includeAttributes !== undefined ? configDescriptor.includeAttributes : undefined;
                const excludedAttributes = configDescriptor.excludeAttributes !== undefined ? configDescriptor.excludeAttributes : undefined;

                if (includedAttributes || excludedAttributes) {
                    modifiedTypeInfo.attributeDescriptors = modifiedTypeInfo.attributeDescriptors.filter((mad) =>
                        (!includedAttributes || includedAttributes.some((inc) => Util.stringMatch(inc,  mad.name!)))
                        && (!excludedAttributes || !excludedAttributes.some((exc) => Util.stringMatch(exc,  mad.name!))));
                }

                // Override any attribute descriptors
                if (configDescriptor.attributeDescriptors) {
                    modifiedTypeInfo.attributeDescriptors.map((attributeDescriptor) => {
                        let configAttributeDescriptor: RulesConfigAttribute | undefined = configDescriptor.attributeDescriptors![attributeDescriptor.name!];
                        if (!configAttributeDescriptor) {
                            configAttributeDescriptor = section && section.attributeDescriptors ? section.attributeDescriptors[attributeDescriptor.name!] : undefined;
                        }
                        if (!configAttributeDescriptor) {
                            configAttributeDescriptor = config.descriptors!.all && config.descriptors!.all.attributeDescriptors ? config.descriptors!.all.attributeDescriptors[attributeDescriptor.name!] : undefined;
                        }
                        if (configAttributeDescriptor) {
                            if (configAttributeDescriptor.type) {
                                attributeDescriptor.type = configAttributeDescriptor.type;
                            }
                            if (configAttributeDescriptor.format) {
                                attributeDescriptor.format = configAttributeDescriptor.format;
                            }
                            if (configAttributeDescriptor.units) {
                                attributeDescriptor.units = configAttributeDescriptor.units;
                            }
                            if (configAttributeDescriptor.constraints) {
                                attributeDescriptor.constraints = attributeDescriptor.constraints ? [...configAttributeDescriptor.constraints,...attributeDescriptor.constraints] : configAttributeDescriptor.constraints;
                            }
                        }
                    });
                }
            }
            return modifiedTypeInfo;
        });

    });
}

export class OrRulesRuleChangedEvent extends CustomEvent<boolean> {

    public static readonly NAME = "or-rules-rule-changed";

    constructor(valid: boolean) {
        super(OrRulesRuleChangedEvent.NAME, {
            bubbles: true,
            composed: true,
            detail: valid
        });
    }
}

export class OrRulesRuleUnsupportedEvent extends CustomEvent<void> {

    public static readonly NAME = "or-rules-rule-unsupported";

    constructor() {
        super(OrRulesRuleUnsupportedEvent.NAME, {
            bubbles: true,
            composed: true
        });
    }
}

export interface NodeSelectEventDetail {
    oldNodes: RulesetNode[];
    newNodes: RulesetNode[];
}

export class OrRulesRequestSelectionEvent extends CustomEvent<RequestEventDetail<NodeSelectEventDetail>> {

    public static readonly NAME = "or-rules-request-selection";

    constructor(request: NodeSelectEventDetail) {
        super(OrRulesRequestSelectionEvent.NAME, {
            bubbles: true,
            composed: true,
            detail: {
                detail: request,
                allow: true
            }
        });
    }
}

export class OrRulesSelectionEvent extends CustomEvent<NodeSelectEventDetail> {

    public static readonly NAME = "or-rules-selection";

    constructor(nodes: NodeSelectEventDetail) {
        super(OrRulesSelectionEvent.NAME, {
            bubbles: true,
            composed: true,
            detail: nodes
        });
    }
}

export type AddEventDetail = {
    ruleset: RulesetUnion;
    sourceRuleset?: RulesetUnion;
}

export class OrRulesRequestAddEvent extends CustomEvent<RequestEventDetail<AddEventDetail>> {

    public static readonly NAME = "or-rules-request-add";

    constructor(detail: AddEventDetail) {
        super(OrRulesRequestAddEvent.NAME, {
            bubbles: true,
            composed: true,
            detail: {
                detail: detail,
                allow: true
            }
        });
    }
}

export class OrRulesAddEvent extends CustomEvent<AddEventDetail> {

    public static readonly NAME = "or-rules-add";

    constructor(detail: AddEventDetail) {
        super(OrRulesAddEvent.NAME, {
            bubbles: true,
            composed: true,
            detail: detail
        });
    }
}

export class OrRulesRequestDeleteEvent extends CustomEvent<RequestEventDetail<RulesetNode[]>> {

    public static readonly NAME = "or-rules-request-delete";

    constructor(request: RulesetNode[]) {
        super(OrRulesRequestDeleteEvent.NAME, {
            bubbles: true,
            composed: true,
            detail: {
                detail: request,
                allow: true
            }
        });
    }
}

export type SaveResult = {
    success: boolean,
    ruleset: RulesetUnion,
    isNew: boolean
};

export class OrRulesRequestSaveEvent extends CustomEvent<RequestEventDetail<RulesetUnion>> {

    public static readonly NAME = "or-rules-request-save";

    constructor(ruleset: RulesetUnion) {
        super(OrRulesRequestSaveEvent.NAME, {
            bubbles: true,
            composed: true,
            detail: {
                allow: true,
                detail: ruleset
            }
        });
    }
}

export class OrRulesSaveEvent extends CustomEvent<SaveResult> {

    public static readonly NAME = "or-rules-save";

    constructor(result: SaveResult) {
        super(OrRulesSaveEvent.NAME, {
            bubbles: true,
            composed: true,
            detail: result
        });
    }
}

export class OrRulesDeleteEvent extends CustomEvent<RulesetUnion[]> {

    public static readonly NAME = "or-rules-delete";

    constructor(rulesets: RulesetUnion[]) {
        super(OrRulesDeleteEvent.NAME, {
            bubbles: true,
            composed: true,
            detail: rulesets
        });
    }
}

declare global {
    export interface HTMLElementEventMap {
        [OrRulesRuleUnsupportedEvent.NAME]: OrRulesRuleUnsupportedEvent;
        [OrRulesRuleChangedEvent.NAME]: OrRulesRuleChangedEvent;
        [OrRulesRequestSelectionEvent.NAME]: OrRulesRequestSelectionEvent;
        [OrRulesSelectionEvent.NAME]: OrRulesSelectionEvent;
        [OrRulesRequestAddEvent.NAME]: OrRulesRequestAddEvent;
        [OrRulesAddEvent.NAME]: OrRulesAddEvent;
        [OrRulesRequestDeleteEvent.NAME]: OrRulesRequestDeleteEvent;
        [OrRulesRequestSaveEvent.NAME]: OrRulesRequestSaveEvent;
        [OrRulesSaveEvent.NAME]: OrRulesSaveEvent;
        [OrRulesDeleteEvent.NAME]: OrRulesDeleteEvent;
    }
}

// language=CSS
export const style = css`

    :host {
        display: flex;
        height: 100%;
        width: 100%;
        
        --internal-or-rules-background-color: var(--or-rules-background-color, var(--or-app-color2, ${unsafeCSS(DefaultColor2)}));
        --internal-or-rules-text-color: var(--or-rules-text-color, inherit);
        --internal-or-rules-button-color: var(--or-rules-button-color, var(--or-app-color4, ${unsafeCSS(DefaultColor4)}));
        --internal-or-rules-invalid-color: var(--or-rules-invalid-color, var(--or-app-color6, ${unsafeCSS(DefaultColor6)}));        
        --internal-or-rules-panel-color: var(--or-rules-panel-color, var(--or-app-color1, ${unsafeCSS(DefaultColor1)}));
        --internal-or-rules-line-color: var(--or-rules-line-color, var(--or-app-color5, ${unsafeCSS(DefaultColor5)}));
        
        --internal-or-rules-list-selected-color: var(--or-rules-list-selected-color, var(--or-app-color2, ${unsafeCSS(DefaultColor2)}));
        --internal-or-rules-list-text-color: var(--or-rules-list-text-color, var(--or-app-color3, ${unsafeCSS(DefaultColor3)}));
        --internal-or-rules-list-text-size: var(--or-rules-list-text-size, 15px);
        --internal-or-rules-list-header-height: var(--or-rules-list-header-height, 48px);

        --internal-or-rules-list-button-size: var(--or-rules-list-button-size, 24px);
        
        --internal-or-rules-header-background-color: var(--or-rules-header-background-color, var(--or-app-color1, ${unsafeCSS(DefaultColor1)}));
        --internal-or-rules-header-height: var(--or-rules-header-height, unset);
        
        --or-panel-background-color: var(--internal-or-rules-panel-color);
    }

    or-rule-list {
        min-width: 300px;
        width: 300px;
        z-index: 2;
        display: flex;
        flex-direction: column;
        background-color: var(--internal-or-rules-panel-color);
        color: var(--internal-or-rules-list-text-color);
        box-shadow: ${unsafeCSS(DefaultBoxShadow)};
    }
    
    or-rule-viewer {
        z-index: 1;    
    }
`;

@customElement("or-rules")
export class OrRules extends translate(i18next)(LitElement) {

    public static DEFAULT_RULESET_NAME = "";

    static get styles() {
        return [
            style
        ];
    }

    @property({type: Boolean})
    public readonly?: boolean;

    @property({type: Object})
    public config?: RulesConfig;

    @property({type: String})
    public realm?: string;

    @property({type: String})
    public language?: RulesetLang;

    @property({type: Array})
    public selectedIds?: number[];

    @property({attribute: false})
    private _isValidRule?: boolean;

    @query("#rule-list")
    private _rulesList!: OrRuleList;

    @query("#rule-viewer")
    private _viewer!: OrRuleViewer;

    constructor() {
        super();

        this.addEventListener(OrRulesRequestSelectionEvent.NAME, this._onRuleSelectionRequested);
        this.addEventListener(OrRulesSelectionEvent.NAME, this._onRuleSelectionChanged);
        this.addEventListener(OrRulesAddEvent.NAME, this._onRuleAdd);
        this.addEventListener(OrRulesSaveEvent.NAME, this._onRuleSave);
    }

    protected render() {

        return html`
            <or-rule-list id="rule-list" .config="${this.config}" .language="${this.language}" .selectedIds="${this.selectedIds}"></or-rule-list>
            <or-rule-viewer id="rule-viewer" .config="${this.config}" .readonly="${this.isReadonly()}"></or-rule-viewer>
        `;
    }

    protected isReadonly(): boolean {
        return this.readonly || !manager.hasRole(ClientRole.WRITE_RULES);
    }

    protected _confirmContinue(action: () => void) {
        if (this._viewer.modified) {
            showOkCancelDialog(i18next.t("loseChanges"), i18next.t("confirmContinueRulesetModified"))
                .then((ok) => {
                    if (ok) {
                        action();
                    }
                });
        } else {
            action();
        }
    }

    protected _onRuleSelectionRequested(event: OrRulesRequestSelectionEvent) {
        const isModified = this._viewer.modified;

        if (!isModified) {
            return;
        }

        // Prevent the request and check if user wants to lose changes
        event.detail.allow = false;

        this._confirmContinue(() => {
            const nodes = event.detail.detail.newNodes;
            if (Util.objectsEqual(nodes, event.detail.detail.oldNodes)) {
                // User has clicked the same node so let's force reload it
                this._viewer.ruleset =  {...nodes[0].ruleset};
            } else {
                this.selectedIds = nodes.map((node) => node.ruleset.id!);
                this._viewer.ruleset = nodes.length === 1 ? nodes[0].ruleset : undefined;
            }
        });
    }

    protected _onRuleSelectionChanged(event: OrRulesSelectionEvent) {
        const nodes = event.detail.newNodes;
        this.selectedIds = nodes.map((node) => node.ruleset.id!);
        this._viewer.ruleset = nodes.length === 1 ? {...nodes[0].ruleset} : undefined;
    }

    protected _onRuleAdd(event: OrRulesAddEvent) {
        // Load the ruleset into the viewer
        this._viewer.ruleset = event.detail.ruleset;
    }

    protected async _onRuleSave(event: OrRulesSaveEvent) {
        await this._rulesList.refresh();
        if (event.detail.success && event.detail.isNew) {
            this.selectedIds = [event.detail.ruleset.id!];
        }
    }
}
