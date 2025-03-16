/*
 * Copyright 2017 Scott Bender <scott@scottbender.net> and Joachim Bakke
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const worldtides = require('./sources/worldtides');
const noaa = require('./sources/noaa')

module.exports = function(app) {
  // Interval to update tide data
  const defaultPeriod = 60; // 1 hour
  let unsubscribes = [];

  const plugin = {
    id: "tides-api",
    name: "Tide APIs",
    description: "Plugin that fetches tide data from online sources",
    schema: {
      title: "Tides API",
      type: "object",
      properties: {
        period: {
          title: "Update frequency",
          type: "number",
          description: "How often to update tide data (minutes)",
          default: 60,
          minimum: 1,
        },
      }
    },
    stop() {
      unsubscribes.forEach((f) => f());
      unsubscribes = [];
    }
  };

  const sources = [
    worldtides(app, plugin),
    noaa(app, plugin)
  ];

  // Update plugin schema with sources
  sources.forEach(source => {
    Object.assign(plugin.schema.properties, {
      [source.optionKey]: {
        title: source.title,
        type: "boolean",
        default: false
      },
      ...(source.properties ?? {})
    });
  });

  plugin.start = function(props) {
    app.debug("Starting tides-api: " + JSON.stringify(props));
    plugin.properties = props;

    app.subscriptionmanager.subscribe(
      {
        context: "vessels." + app.selfId,
        subscribe: [
          {
            path: "navigation.position",
            period: (props.period ?? defaultPeriod) * 60 * 1000,
            policy: "fixed",
          },
        ],
      },
      unsubscribes,
      (subscriptionError) => {
        app.error("Error:" + subscriptionError);
      },
      (delta) => {
        delta.updates.forEach(({values}) => {
          values.forEach(({ path, value }) => {
            if (path === "navigation.position") {
              performUpdate(value);
            }
          });
        });
      }
    );

    // Perform initial update on startup
    performUpdate(app.getSelfPath("navigation.position.value"));
  }

  async function performUpdate(position) {
    if (!position) {
      app.setPluginStatus("No position available");
      return;
    }

    await Promise.all(
      sources.map(async (source) => {
        if (!plugin.properties[source.optionKey]) {
          app.debug(`${source.optionKey} is not enabled, skipping...`);
          return;
        }

        try {
          const values = await source.calculator(position);
          if (!values) return;

          const delta = {
            context: "vessels." + app.selfId,
            updates: [
              {
                timestamp: new Date().toISOString(),
                values: values,
              },
            ],
          };

          app.debug("Sending delta: " + JSON.stringify(delta));
          app.handleMessage(plugin.id, delta);
        } catch (err) {
          app.setPluginError(err.message);
          app.error(err.message);
        }
      })
    );

    app.setPluginStatus("Updated tide data");
  }

  return plugin;
}
