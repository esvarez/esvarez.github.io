# Invoked by `sam build` (see template.yaml Metadata.BuildMethod: makefile).
# Each target must place a "bootstrap" binary in $(ARTIFACTS_DIR).

build-GetDataFunction:
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o $(ARTIFACTS_DIR)/bootstrap ./cmd/getdata

build-PutInterestFunction:
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o $(ARTIFACTS_DIR)/bootstrap ./cmd/putinterest

build-PutAttendanceFunction:
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o $(ARTIFACTS_DIR)/bootstrap ./cmd/putattendance
