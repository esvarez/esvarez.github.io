// Command seed loads the frontend's data/games.json fixture into the
// DynamoDB table so the deployed API starts with the same sample data as
// the static site. Run locally with your own AWS credentials, once, after
// `sam deploy`:
//
//	go run ./cmd/seed -table <TableName> -data ../data/games.json
package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"os"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"boardgamenight/backend/internal/store"
)

func main() {
	table := flag.String("table", "", "DynamoDB table name (see the SAM stack's TableName output)")
	dataPath := flag.String("data", "../data/games.json", "path to the games.json fixture to load")
	flag.Parse()

	if *table == "" {
		log.Fatal("-table is required")
	}

	raw, err := os.ReadFile(*dataPath)
	if err != nil {
		log.Fatalf("read %s: %v", *dataPath, err)
	}

	var fixture store.Snapshot
	if err := json.Unmarshal(raw, &fixture); err != nil {
		log.Fatalf("parse %s: %v", *dataPath, err)
	}

	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("load aws config: %v", err)
	}
	st := store.New(dynamodb.NewFromConfig(cfg), *table)
	ctx := context.Background()

	for _, p := range fixture.Players {
		if err := st.PutPlayer(ctx, p); err != nil {
			log.Fatal(err)
		}
	}
	log.Printf("seeded %d players", len(fixture.Players))

	for _, g := range fixture.Games {
		if err := st.PutGame(ctx, g); err != nil {
			log.Fatal(err)
		}
		for playerID, interested := range g.Interest {
			if err := st.PutInterest(ctx, g.ID, playerID, interested); err != nil {
				log.Fatal(err)
			}
		}
	}
	log.Printf("seeded %d games", len(fixture.Games))

	for _, d := range fixture.Days {
		if err := st.PutDay(ctx, d); err != nil {
			log.Fatal(err)
		}
		for _, playerID := range d.Attendees {
			if err := st.PutAttendance(ctx, d.ID, playerID, true); err != nil {
				log.Fatal(err)
			}
		}
	}
	log.Printf("seeded %d days", len(fixture.Days))
}
