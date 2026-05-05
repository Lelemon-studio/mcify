{{/*
Expand the name of the chart.
*/}}
{{- define "mcify.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name. We truncate at 63 chars because some Kubernetes
name fields are limited to that length (RFC 1123 label).
*/}}
{{- define "mcify.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart name and version label.
*/}}
{{- define "mcify.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "mcify.labels" -}}
helm.sh/chart: {{ include "mcify.chart" . }}
{{ include "mcify.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "mcify.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mcify.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "mcify.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "mcify.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image reference. Defaults the tag to .Chart.AppVersion when not set.
*/}}
{{- define "mcify.image" -}}
{{- $tag := default .Chart.AppVersion .Values.image.tag -}}
{{- printf "%s:%s" .Values.image.repository $tag -}}
{{- end }}

{{/*
Name of the Secret to mount as env. Empty string means none.
*/}}
{{- define "mcify.secretName" -}}
{{- if .Values.secret.existing -}}
{{- .Values.secret.existing -}}
{{- else if .Values.secret.create -}}
{{- include "mcify.fullname" . -}}
{{- end -}}
{{- end }}
