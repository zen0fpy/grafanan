+++
title = "Grafana 8 Alerts"
aliases = ["/docs/grafana/latest/alerting/metrics/"]
weight = 113
+++

# Overview of Grafana 8 alerts

Alerts allow you to know about problems in your systems moments after they occur. Robust and actionable alerts help you identify and resolve issues quickly, minimizing disruption to your services.

> **Note:** Grafana 8 alerts (beta) is an [opt-in]({{< relref"./opt-in.md" >}}) feature. Out of the box, Grafana still supports old [legacy dashboard alerts]({{< relref "../old-alerting/_index.md" >}}). We encourage you to create issues in the Grafana GitHub repository for bugs found while testing this new feature.

Grafana 8 alerts have four main components:

- Alerting rule - One or more query and/or expression, a condition, the frequency of evaluation, and the (optional) duration that a condition must be met before creating an alert.
- Contact point - A channel for sending notifications when the conditions of an alerting rule are met.
- Notification policy - A set of matching and grouping criteria used to determine where, and how frequently, to send notifications.
- Silences - Date and matching criteria used to silence notifications.

## Alerting tasks

You can perform the following tasks for alerts:

- [Create a Grafana managed alert rule]({{< relref "alerting-rules/create-grafana-managed-rule.md" >}})
- [Create a Cortex or Loki managed alert rule]({{< relref "alerting-rules/create-cortex-loki-managed-rule.md" >}})
- [View existing alert rules and their current state]({{< relref "alerting-rules/rule-list.md" >}})
- [View state and health of alerting rules]({{< relref "alerting-rules/state-and-health.md" >}})
- [Add or edit an alert contact point]({{< relref "./contact-points.md" >}})
- [Add or edit notification policies]({{< relref "./notification-policies.md" >}})
- [Create and edit silences]({{< relref "./silences.md" >}})

## Clustering

The current alerting system doesn't support high availability. Alert notifications are not deduplicated and load balancing is not supported between instances e.g. silences from one instance will not appear in the other. The Grafana team aims to have this feature by Grafana version 8.1+.

## Alert evaluation

Grafana managed alerts are evaluated by the Grafana backend. Rule evaluations are scheduled, according to the alert rule configuration, and queries are evaluated by an engine that is part of core Grafana.

Alerting rules can only query backend data sources with alerting enabled:

- builtin or developed and maintained by grafana: `Graphite`, `Prometheus`, `Loki`, `InfluxDB`, `Elasticsearch`,
  `Google Cloud Monitoring`, `Cloudwatch`, `Azure Monitor`, `MySQL`, `PostgreSQL`, `MSSQL`, `OpenTSDB`, `Oracle`, and `Azure Data Explorer`
- any community backend data sources with alerting enabled (`backend` and `alerting` properties are set in the [plugin.json]({{< relref "../../developers/plugins/metadata.md" >}}))

## Metrics from the alerting engine

The alerting engine publishes some internal metrics about itself. You can read more about how Grafana publishes [internal metrics]({{< relref "../../administration/view-server/internal-metrics.md" >}}).

| Metric Name                                 | Type      | Description                                                                              |
| ------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| `alerting.alerts`                           | gauge     | How many alerts by state                                                                 |
| `alerting.request_duration_seconds`         | histogram | Histogram of requests to the Alerting API                                                |
| `alerting.active_configurations`            | gauge     | The number of active, non default Alertmanager configurations for grafana managed alerts |
| `alerting.rule_evaluations_total`           | counter   | The total number of rule evaluations                                                     |
| `alerting.rule_evaluation_failures_total`   | counter   | The total number of rule evaluation failures                                             |
| `alerting.rule_evaluation_duration_seconds` | summary   | The duration for a rule to execute                                                       |
| `alerting.rule_group_rules`                 | gauge     | The number of rules                                                                      |

- [View alert rules and their current state]({{< relref "alerting-rules/rule-list.md" >}})
