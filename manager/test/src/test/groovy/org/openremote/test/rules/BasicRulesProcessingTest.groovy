package org.openremote.test.rules

import elemental.json.Json
import org.openremote.manager.server.asset.AssetProcessingService
import org.openremote.manager.server.asset.AssetStorageService
import org.openremote.manager.server.asset.ServerAsset
import org.openremote.manager.server.rules.RulesDeployment
import org.openremote.manager.server.rules.RulesService
import org.openremote.manager.server.rules.RulesetStorageService
import org.openremote.manager.server.setup.SetupService
import org.openremote.manager.server.setup.builtin.KeycloakDemoSetup
import org.openremote.manager.server.setup.builtin.ManagerDemoSetup
import org.openremote.manager.shared.rules.AssetRuleset
import org.openremote.manager.shared.rules.GlobalRuleset
import org.openremote.manager.shared.rules.Ruleset.DeploymentStatus
import org.openremote.model.AttributeEvent
import org.openremote.model.AttributeType
import org.openremote.model.Meta
import org.openremote.model.MetaItem
import org.openremote.model.asset.AssetAttribute
import org.openremote.model.asset.AssetAttributes
import org.openremote.model.asset.AssetMeta
import org.openremote.model.asset.AssetType
import org.openremote.test.ManagerContainerTrait
import spock.lang.Specification
import spock.util.concurrent.PollingConditions

import static org.openremote.test.RulesTestUtil.attachRuleExecutionLogger

class BasicRulesProcessingTest extends Specification implements ManagerContainerTrait {

    RulesDeployment globalEngine, masterEngine, customerAEngine, smartHomeEngine, apartment1Engine, apartment2Engine, apartment3Engine

    List<String> globalEngineFiredRules = []
    List<String> masterEngineFiredRules = []
    List<String> customerAEngineFiredRules = []
    List<String> smartHomeEngineFiredRules = []
    List<String> apartment1EngineFiredRules = []
    List<String> apartment2EngineFiredRules = []
    List<String> apartment3EngineFiredRules = []

    def resetRuleExecutionLoggers() {
        globalEngineFiredRules.clear()
        customerAEngineFiredRules.clear()
        smartHomeEngineFiredRules.clear()
        apartment1EngineFiredRules.clear()
        apartment2EngineFiredRules.clear()
        apartment3EngineFiredRules.clear()
    }

    def assertNoRulesFired = {
        assert globalEngineFiredRules.size() == 0
        assert masterEngineFiredRules.size() == 0
        assert customerAEngineFiredRules.size() == 0
        assert smartHomeEngineFiredRules.size() == 0
        assert apartment1EngineFiredRules.size() == 0
        assert apartment2EngineFiredRules.size() == 0
        assert apartment3EngineFiredRules.size() == 0
    }


    def "Check firing of rules"() {
        given: "expected conditions"
        def conditions = new PollingConditions(timeout: 10)

        and: "the container is started"
        def serverPort = findEphemeralPort()
        def container = startContainerWithoutDemoRules(defaultConfig(serverPort), defaultServices())
        def managerDemoSetup = container.getService(SetupService.class).getTaskOfType(ManagerDemoSetup.class)
        def keycloakDemoSetup = container.getService(SetupService.class).getTaskOfType(KeycloakDemoSetup.class)
        def rulesService = container.getService(RulesService.class)
        def rulesetStorageService = container.getService(RulesetStorageService.class)
        def assetProcessingService = container.getService(AssetProcessingService.class)
        def assetStorageService = container.getService(AssetStorageService.class)

        and: "some test rulesets have been imported"
        new BasicRulesImport(rulesetStorageService, keycloakDemoSetup, managerDemoSetup)

        expect: "the rule engines to become available and be running"
        conditions.eventually {
            globalEngine = rulesService.globalDeployment
            assert globalEngine != null
            assert globalEngine.isRunning()
            masterEngine = rulesService.tenantDeployments.get(keycloakDemoSetup.masterTenant.id)
            assert masterEngine != null
            assert masterEngine.isRunning()
            customerAEngine = rulesService.tenantDeployments.get(keycloakDemoSetup.customerATenant.id)
            assert customerAEngine != null
            assert customerAEngine.isRunning()
            smartHomeEngine = rulesService.assetDeployments.get(managerDemoSetup.smartHomeId)
            assert smartHomeEngine == null
            apartment1Engine = rulesService.assetDeployments.get(managerDemoSetup.apartment1Id)
            assert apartment1Engine != null
            assert apartment1Engine.isRunning()
            apartment2Engine = rulesService.assetDeployments.get(managerDemoSetup.apartment2Id)
            assert apartment2Engine == null
            apartment3Engine = rulesService.assetDeployments.get(managerDemoSetup.apartment3Id)
            assert apartment3Engine != null
            assert apartment3Engine.isRunning()
        }

        and: "the demo attributes marked with RULES_FACT = true meta should be inserted into the engines"
        conditions.eventually {
            assert rulesService.facts.size() == 8
            assert globalEngine.facts.size() == 8
            assert masterEngine.facts.size() == 0
            assert customerAEngine.facts.size() == 8
            assert apartment1Engine.facts.size() == 4
            assert apartment3Engine.facts.size() == 2
        }

        when: "rule execution loggers are attached to the engines"
        attachRuleExecutionLogger(globalEngine, globalEngineFiredRules)
        attachRuleExecutionLogger(masterEngine, masterEngineFiredRules)
        attachRuleExecutionLogger(customerAEngine, customerAEngineFiredRules)
        attachRuleExecutionLogger(apartment1Engine, apartment1EngineFiredRules)
        attachRuleExecutionLogger(apartment3Engine, apartment3EngineFiredRules)

        and: "an attribute event is pushed into the system for an attribute with RULES_FACT meta set to true"
        def apartment1LivingRoomPresenceDetectedChange = new AttributeEvent(
                managerDemoSetup.apartment1LivingroomId, "presenceDetected", Json.create(true)
        )
        assetProcessingService.updateAttributeValue(apartment1LivingRoomPresenceDetectedChange)

        then: "the rule engines in scope should fire the 'All' and 'All changed' rules"
        conditions.eventually {
            def expectedFiredRules = ["All", "All changed"]
            assert globalEngineFiredRules.size() == 2
            assert globalEngineFiredRules.containsAll(expectedFiredRules)
            assert masterEngineFiredRules.size() == 0
            assert customerAEngineFiredRules.size() == 2
            assert customerAEngineFiredRules.containsAll(expectedFiredRules)
            assert smartHomeEngineFiredRules.size() == 0
            assert apartment1EngineFiredRules.size() == 2
            assert apartment1EngineFiredRules.containsAll(expectedFiredRules)
            assert apartment3EngineFiredRules.size() == 0
        }

        when: "an attribute event is pushed into the system for an attribute with RULES_FACT meta set to false"
        resetRuleExecutionLoggers()
        def apartment1LivingRoomLightSwitchChange = new AttributeEvent(
                managerDemoSetup.apartment1LivingroomId, "lightSwitch", Json.create(true)
        )
        assetProcessingService.updateAttributeValue(apartment1LivingRoomLightSwitchChange)

        then: "no rule engines should have fired after a few seconds"
        new PollingConditions(initialDelay: 3).eventually assertNoRulesFired

        when: "an attribute event is pushed into the system for an attribute with no RULES_FACT meta"
        resetRuleExecutionLoggers()
        def apartment1LivingRoomWindowOpenChange = new AttributeEvent(
                managerDemoSetup.apartment1LivingroomId, "windowOpen", Json.create(true)
        )
        assetProcessingService.updateAttributeValue(apartment1LivingRoomWindowOpenChange)

        then: "no rule engines should have fired after a few seconds"
        new PollingConditions(initialDelay: 3).eventually assertNoRulesFired

        when: "an old (stale) attribute event is pushed into the system"
        resetRuleExecutionLoggers()
        assetProcessingService.updateAttributeValue(apartment1LivingRoomPresenceDetectedChange)

        then: "no rule engines should have fired after a few seconds"
        new PollingConditions(initialDelay: 3).eventually assertNoRulesFired

        when: "an attribute event with the same value as current value is pushed into the system"
        resetRuleExecutionLoggers()
        apartment1LivingRoomPresenceDetectedChange = new AttributeEvent(
                managerDemoSetup.apartment1LivingroomId, "presenceDetected", Json.create(true)
        )
        assetProcessingService.updateAttributeValue(apartment1LivingRoomPresenceDetectedChange)

        then: "the rule engines in scope should fire the 'All' rule but not the 'All changed' rule"
        conditions.eventually {
            assert globalEngineFiredRules.size() == 1
            assert globalEngineFiredRules[0] == "All"
            assert masterEngineFiredRules.size() == 0
            assert customerAEngineFiredRules.size() == 1
            assert customerAEngineFiredRules[0] == "All"
            assert smartHomeEngineFiredRules.size() == 0
            assert apartment1EngineFiredRules.size() == 1
            assert apartment1EngineFiredRules[0] == "All"
            assert apartment3EngineFiredRules.size() == 0
        }

        when: "a LHS filtering test rule definition is loaded into the smart home asset"
        resetRuleExecutionLoggers()
        def assetRuleset = new AssetRuleset(
                "Some smart home asset rules",
                managerDemoSetup.smartHomeId,
                getClass().getResource("/org/openremote/test/rules/BasicSmartHomeMatchAllAssetUpdates.drl").text
        )
        rulesetStorageService.merge(assetRuleset)

        then: "the smart home rule engine should have ben created, loaded the new rule definition and facts and started"
        conditions.eventually {
            smartHomeEngine = rulesService.assetDeployments.get(managerDemoSetup.smartHomeId)
            assert smartHomeEngine != null
            assert smartHomeEngine.isRunning()
            assert smartHomeEngine.facts.size() == 8
            assert smartHomeEngine.allRulesets.length == 1
            assert smartHomeEngine.allRulesets[0].enabled
            assert smartHomeEngine.allRulesets[0].name == "Some smart home asset rules"
            assert smartHomeEngine.allRulesets[0].deploymentStatus == DeploymentStatus.DEPLOYED
        }

        when: "the engine counters are reset and the smart home engine logger is attached"
        resetRuleExecutionLoggers()
        attachRuleExecutionLogger(smartHomeEngine, smartHomeEngineFiredRules)

        and: "an apartment 3 living room attribute event occurs"
        def apartment3LivingRoomPresenceDetectedChange = new AttributeEvent(
                managerDemoSetup.apartment3LivingroomId, "presenceDetected", Json.create(true)
        )
        assetProcessingService.updateAttributeValue(apartment3LivingRoomPresenceDetectedChange)

        then: "the engines in scope should have fired the matched rules"
        conditions.eventually {
            assert globalEngineFiredRules.size() == 2
            assert globalEngineFiredRules.containsAll(["All", "All changed"])
            assert customerAEngineFiredRules.size() == 2
            assert customerAEngineFiredRules.containsAll(["All", "All changed"])
            assert smartHomeEngineFiredRules.size() == 5
            assert smartHomeEngineFiredRules.containsAll(["Living Room All", "Current Asset Update", "Parent Type Residence", "Asset Type Room", "Boolean Attributes"])
            assert apartment3EngineFiredRules.size() == 2
            assert apartment3EngineFiredRules.containsAll(["All", "All changed"])
            assert apartment1EngineFiredRules.size() == 0
        }

        when: "an apartment 1 living room thermostat attribute event occurs"
        resetRuleExecutionLoggers()
        def apartment1LivingRoomComfortTemperatureChange = new AttributeEvent(
                managerDemoSetup.apartment1LivingroomThermostatId, "comfortTemperature", Json.create(22.5)
        )
        assetProcessingService.updateAttributeValue(apartment1LivingRoomComfortTemperatureChange)

        then: "the engines in scope should have fired the matched rules"
        conditions.eventually {
            assert globalEngineFiredRules.size() == 2
            assert globalEngineFiredRules.containsAll(["All", "All changed"])
            assert customerAEngineFiredRules.size() == 2
            assert customerAEngineFiredRules.containsAll(["All", "All changed"])
            assert smartHomeEngineFiredRules.size() == 5
            assert smartHomeEngineFiredRules.containsAll(
                    [
                            "Living Room Thermostat",
                            "Living Room Comfort Temperature",
                            "Living Room as Parent",
                            "JSON Number value types",
                            "Current Asset Update"
                    ])
            assert apartment1EngineFiredRules.size() == 2
            assert apartment1EngineFiredRules.containsAll(["All", "All changed"])
            assert apartment3EngineFiredRules.size() == 0
        }

        when: "a RHS filtering test rule definition is loaded into the global rule engine"
        assetRuleset = new GlobalRuleset(
                "Some global test rules",
                getClass().getResource("/org/openremote/test/rules/BasicSmartHomePreventAssetUpdate.drl").text
        )
        rulesetStorageService.merge(assetRuleset)

        then: "the global rule engine should have loaded the new rule definition and restarted"
        conditions.eventually {
            globalEngine = rulesService.globalDeployment
            assert globalEngine != null
            assert globalEngine.isRunning()
            assert globalEngine.facts.size() == 8
            assert globalEngine.allRulesets.length == 2
            assert globalEngine.allRulesets[1].enabled
            assert globalEngine.allRulesets[1].name == "Some global test rules"
            assert globalEngine.allRulesets[1].deploymentStatus == DeploymentStatus.DEPLOYED
        }

        when: "the engine counters are reset and the global engine logger is reattached"
        resetRuleExecutionLoggers()
        attachRuleExecutionLogger(globalEngine, globalEngineFiredRules)

        and: "an apartment 1 living room thermostat attribute event occurs"
        apartment1LivingRoomComfortTemperatureChange = new AttributeEvent(
                managerDemoSetup.apartment1LivingroomThermostatId, "comfortTemperature", Json.create(20.3)
        )
        assetProcessingService.updateAttributeValue(apartment1LivingRoomComfortTemperatureChange)

        then: "after a few seconds only the global engine should have fired the All, All changed and Prevent Livingroom Thermostat Change rules"
        conditions.eventually {
            assert globalEngineFiredRules.size() == 3
            assert globalEngineFiredRules.containsAll(["All", "All changed", "Prevent Livingroom Thermostat Change"])
            assert customerAEngineFiredRules.size() == 0
            assert smartHomeEngineFiredRules.size() == 0
            assert apartment1EngineFiredRules.size() == 0
            assert apartment3EngineFiredRules.size() == 0
        }

        when: "an apartment 3 living room attribute event occurs"
        resetRuleExecutionLoggers()
        apartment3LivingRoomPresenceDetectedChange = new AttributeEvent(
                managerDemoSetup.apartment3LivingroomId, "presenceDetected", Json.create(false)
        )
        assetProcessingService.updateAttributeValue(apartment3LivingRoomPresenceDetectedChange)

        then: "all the engines in scope should have fired the matched rules"
        conditions.eventually {
            assert globalEngineFiredRules.size() == 2
            assert globalEngineFiredRules.containsAll(["All", "All changed"])
            assert customerAEngineFiredRules.size() == 2
            assert customerAEngineFiredRules.containsAll(["All", "All changed"])
            assert smartHomeEngineFiredRules.size() == 5
            assert smartHomeEngineFiredRules.containsAll(["Living Room All", "Current Asset Update", "Parent Type Residence", "Asset Type Room", "Boolean Attributes"])
            assert apartment3EngineFiredRules.size() == 2
            assert apartment3EngineFiredRules.containsAll(["All", "All changed"])
            assert apartment1EngineFiredRules.size() == 0
        }

        when: "a Kitchen room asset is inserted into apartment 1 that contains a RULES_FACT = true meta flag"
        resetRuleExecutionLoggers()
        def apartment1 = assetStorageService.find(managerDemoSetup.apartment1Id)
        def asset = new ServerAsset(apartment1)
        asset.setRealmId(keycloakDemoSetup.customerATenant.getId())
        asset.setType(AssetType.ROOM)
        asset.setName("Kitchen")
        AssetAttributes attributes = new AssetAttributes()
        attributes.put(
                new AssetAttribute("testString", AttributeType.STRING, Json.create("test"))
                        .setMeta(
                        new Meta()
                                .add(new MetaItem(AssetMeta.RULES_FACT, Json.create(true)))
                )
        )
        asset.setAttributes(attributes.getJsonObject())
        asset = assetStorageService.merge(asset)

        then: "after a few seconds the engines in scope should not have fired any rules but the facts should have been inserted"
        conditions.eventually {
            assert rulesService.facts.size() == 9
            assert globalEngine.facts.size() == 9
            assert masterEngine.facts.size() == 0
            assert customerAEngine.facts.size() == 9
            assert smartHomeEngine.facts.size() == 9
            assert apartment1Engine.facts.size() == 5
            assert apartment3Engine.facts.size() == 2
            assert globalEngineFiredRules.size() == 0
            assert customerAEngineFiredRules.size() == 0
            assert smartHomeEngineFiredRules.size() == 0
            assert apartment1EngineFiredRules.size() == 0
            assert apartment3EngineFiredRules.size() == 0
        }

        when: "the Kitchen room asset is modified to add a new attribute but RULES_FACT = true meta is not changed"
        resetRuleExecutionLoggers()
        attributes = new AssetAttributes()
        attributes.put(
                new AssetAttribute("testString", AttributeType.STRING, Json.create("test"))
                        .setMeta(
                        new Meta()
                                .add(new MetaItem(AssetMeta.RULES_FACT, Json.create(true)))
                ),
                new AssetAttribute("testInteger", AttributeType.INTEGER, Json.create(0))
        )
        asset.setAttributes(attributes.getJsonObject())
        asset = assetStorageService.merge(asset)

        then: "after a few seconds the fact count shouldn't change and no rules should have fired"
        new PollingConditions(initialDelay: 3).eventually {
            assert rulesService.facts.size() == 9
            assert globalEngine.facts.size() == 9
            assert masterEngine.facts.size() == 0
            assert customerAEngine.facts.size() == 9
            assert smartHomeEngine.facts.size() == 9
            assert apartment1Engine.facts.size() == 5
            assert apartment3Engine.facts.size() == 2
            assert globalEngineFiredRules.size() == 0
            assert customerAEngineFiredRules.size() == 0
            assert smartHomeEngineFiredRules.size() == 0
            assert apartment1EngineFiredRules.size() == 0
            assert apartment3EngineFiredRules.size() == 0
        }

        when: "the Kitchen room asset is modified to set the RULES_FACT to false"
        attributes = new AssetAttributes()
        attributes.put(
                new AssetAttribute("testString", AttributeType.STRING, Json.create("test"))
                        .setMeta(
                        new Meta()
                                .add(new MetaItem(AssetMeta.RULES_FACT, Json.create(false)))
                ),
                new AssetAttribute("testInteger", AttributeType.INTEGER, Json.create(0))
        )
        asset.setAttributes(attributes.getJsonObject())
        asset = assetStorageService.merge(asset)

        then: "the facts should be removed from the rule engines and no rules should have fired"
        conditions.eventually {
            assert rulesService.facts.size() == 8
            assert globalEngine.facts.size() == 8
            assert masterEngine.facts.size() == 0
            assert customerAEngine.facts.size() == 8
            assert smartHomeEngine.facts.size() == 8
            assert apartment1Engine.facts.size() == 4
            assert apartment3Engine.facts.size() == 2
            assert globalEngineFiredRules.size() == 0
            assert customerAEngineFiredRules.size() == 0
            assert smartHomeEngineFiredRules.size() == 0
            assert apartment1EngineFiredRules.size() == 0
            assert apartment3EngineFiredRules.size() == 0
        }

        when: "the Kitchen room asset is modified to set all attributes to RULES_FACT = true"
        resetRuleExecutionLoggers()
        attributes = new AssetAttributes()
        attributes.put(
                new AssetAttribute("testString", AttributeType.STRING, Json.create("test"))
                        .setMeta(
                        new Meta()
                                .add(new MetaItem(AssetMeta.RULES_FACT, Json.create(true)))
                ),
                new AssetAttribute("testInteger", AttributeType.INTEGER, Json.create(0))
                        .setMeta(
                        new Meta()
                                .add(new MetaItem(AssetMeta.RULES_FACT, Json.create(true)))
                )
        )
        asset.setAttributes(attributes.getJsonObject())
        asset = assetStorageService.merge(asset)

        then: "the facts should be added to the rule engines and no rules should have fired"
        conditions.eventually {
            assert rulesService.facts.size() == 10
            assert globalEngine.facts.size() == 10
            assert masterEngine.facts.size() == 0
            assert customerAEngine.facts.size() == 10
            assert smartHomeEngine.facts.size() == 10
            assert apartment1Engine.facts.size() == 6
            assert apartment3Engine.facts.size() == 2
            assert globalEngineFiredRules.size() == 0
            assert customerAEngineFiredRules.size() == 0
            assert smartHomeEngineFiredRules.size() == 0
            assert apartment1EngineFiredRules.size() == 0
            assert apartment3EngineFiredRules.size() == 0
        }

        when: "the Kitchen room asset is deleted"
        resetRuleExecutionLoggers()
        assetStorageService.delete(asset.getId())

        then: "the facts should be removed from the rule engines and no rules should have fired"
        conditions.eventually {
            assert rulesService.facts.size() == 8
            assert globalEngine.facts.size() == 8
            assert masterEngine.facts.size() == 0
            assert customerAEngine.facts.size() == 8
            assert smartHomeEngine.facts.size() == 8
            assert apartment1Engine.facts.size() == 4
            assert apartment3Engine.facts.size() == 2
            assert globalEngineFiredRules.size() == 0
            assert customerAEngineFiredRules.size() == 0
            assert smartHomeEngineFiredRules.size() == 0
            assert apartment1EngineFiredRules.size() == 0
            assert apartment3EngineFiredRules.size() == 0
        }

        cleanup: "the server should be stopped"
        stopContainer(container)
    }
}
