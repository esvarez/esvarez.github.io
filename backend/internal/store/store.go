// Package store implements a single-table DynamoDB layout for board game
// night data:
//
//	PK              SK                  attributes
//	PLAYER#<id>     PROFILE             Name, Initial
//	GAME#<id>       PROFILE             Name, Min, Max
//	GAME#<id>       INTEREST#<player>   Interested (bool)
//	DAY#<id>        PROFILE             Name
//	DAY#<id>        ATTENDEE#<player>   Attending (bool)
//
// The dataset is small (a handful of games, players and days), so GetSnapshot
// reads the whole table with a Scan rather than issuing per-entity queries.
package store

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const skProfile = "PROFILE"

const (
	playerPrefix   = "PLAYER#"
	gamePrefix     = "GAME#"
	dayPrefix      = "DAY#"
	interestPrefix = "INTEREST#"
	attendeePrefix = "ATTENDEE#"
)

type Store struct {
	client *dynamodb.Client
	table  string
}

func New(client *dynamodb.Client, table string) *Store {
	return &Store{client: client, table: table}
}

func (s *Store) GetSnapshot(ctx context.Context) (Snapshot, error) {
	var items []map[string]types.AttributeValue

	paginator := dynamodb.NewScanPaginator(s.client, &dynamodb.ScanInput{
		TableName: aws.String(s.table),
	})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return Snapshot{}, fmt.Errorf("scan table: %w", err)
		}
		items = append(items, page.Items...)
	}

	return assembleSnapshot(items), nil
}

// assembleSnapshot groups raw scanned items into the Player/Game/Day shape
// the frontend expects. Split out from GetSnapshot so it can be unit
// tested without a live DynamoDB table.
func assembleSnapshot(items []map[string]types.AttributeValue) Snapshot {
	var snapshot Snapshot
	gameByID := map[string]*Game{}
	dayByID := map[string]*Day{}

	for _, item := range items {
		pk := stringAttr(item, "PK")
		sk := stringAttr(item, "SK")

		switch {
		case strings.HasPrefix(pk, playerPrefix) && sk == skProfile:
			snapshot.Players = append(snapshot.Players, Player{
				ID:      strings.TrimPrefix(pk, playerPrefix),
				Name:    stringAttr(item, "Name"),
				Initial: stringAttr(item, "Initial"),
			})

		case strings.HasPrefix(pk, gamePrefix) && sk == skProfile:
			g := gameFor(gameByID, strings.TrimPrefix(pk, gamePrefix))
			g.Name = stringAttr(item, "Name")
			g.Min = intAttr(item, "Min")
			g.Max = intAttr(item, "Max")

		case strings.HasPrefix(pk, gamePrefix) && strings.HasPrefix(sk, interestPrefix):
			g := gameFor(gameByID, strings.TrimPrefix(pk, gamePrefix))
			g.Interest[strings.TrimPrefix(sk, interestPrefix)] = boolAttr(item, "Interested")

		case strings.HasPrefix(pk, dayPrefix) && sk == skProfile:
			d := dayFor(dayByID, strings.TrimPrefix(pk, dayPrefix))
			d.Name = stringAttr(item, "Name")
			d.Place = stringAttr(item, "Place")

		case strings.HasPrefix(pk, dayPrefix) && strings.HasPrefix(sk, attendeePrefix):
			d := dayFor(dayByID, strings.TrimPrefix(pk, dayPrefix))
			if boolAttr(item, "Attending") {
				d.Attendees = append(d.Attendees, strings.TrimPrefix(sk, attendeePrefix))
			}
		}
	}

	for _, g := range gameByID {
		snapshot.Games = append(snapshot.Games, *g)
	}
	for _, d := range dayByID {
		sort.Strings(d.Attendees)
		snapshot.Days = append(snapshot.Days, *d)
	}

	sort.Slice(snapshot.Players, func(i, j int) bool { return snapshot.Players[i].ID < snapshot.Players[j].ID })
	sort.Slice(snapshot.Games, func(i, j int) bool { return snapshot.Games[i].ID < snapshot.Games[j].ID })
	sort.Slice(snapshot.Days, func(i, j int) bool { return snapshot.Days[i].ID < snapshot.Days[j].ID })

	return snapshot
}

func gameFor(byID map[string]*Game, id string) *Game {
	g, ok := byID[id]
	if !ok {
		g = &Game{ID: id, Interest: map[string]bool{}}
		byID[id] = g
	}
	return g
}

func dayFor(byID map[string]*Day, id string) *Day {
	d, ok := byID[id]
	if !ok {
		d = &Day{ID: id}
		byID[id] = d
	}
	return d
}

func (s *Store) PutInterest(ctx context.Context, gameID, playerID string, interested bool) error {
	if gameID == "" || playerID == "" {
		return fmt.Errorf("gameID and playerID are required")
	}
	_, err := s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(s.table),
		Item: map[string]types.AttributeValue{
			"PK":         &types.AttributeValueMemberS{Value: gamePrefix + gameID},
			"SK":         &types.AttributeValueMemberS{Value: interestPrefix + playerID},
			"Interested": &types.AttributeValueMemberBOOL{Value: interested},
		},
	})
	if err != nil {
		return fmt.Errorf("put interest: %w", err)
	}
	return nil
}

func (s *Store) PutAttendance(ctx context.Context, dayID, playerID string, attending bool) error {
	if dayID == "" || playerID == "" {
		return fmt.Errorf("dayID and playerID are required")
	}
	_, err := s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(s.table),
		Item: map[string]types.AttributeValue{
			"PK":        &types.AttributeValueMemberS{Value: dayPrefix + dayID},
			"SK":        &types.AttributeValueMemberS{Value: attendeePrefix + playerID},
			"Attending": &types.AttributeValueMemberBOOL{Value: attending},
		},
	})
	if err != nil {
		return fmt.Errorf("put attendance: %w", err)
	}
	return nil
}

// PutPlayer, PutGame and PutDay write profile items. They exist for the
// seed command; the API Lambdas only ever write interest/attendance items.

func (s *Store) PutPlayer(ctx context.Context, p Player) error {
	_, err := s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(s.table),
		Item: map[string]types.AttributeValue{
			"PK":      &types.AttributeValueMemberS{Value: playerPrefix + p.ID},
			"SK":      &types.AttributeValueMemberS{Value: skProfile},
			"Name":    &types.AttributeValueMemberS{Value: p.Name},
			"Initial": &types.AttributeValueMemberS{Value: p.Initial},
		},
	})
	if err != nil {
		return fmt.Errorf("put player %s: %w", p.ID, err)
	}
	return nil
}

func (s *Store) PutGame(ctx context.Context, g Game) error {
	_, err := s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(s.table),
		Item: map[string]types.AttributeValue{
			"PK":   &types.AttributeValueMemberS{Value: gamePrefix + g.ID},
			"SK":   &types.AttributeValueMemberS{Value: skProfile},
			"Name": &types.AttributeValueMemberS{Value: g.Name},
			"Min":  &types.AttributeValueMemberN{Value: strconv.Itoa(g.Min)},
			"Max":  &types.AttributeValueMemberN{Value: strconv.Itoa(g.Max)},
		},
	})
	if err != nil {
		return fmt.Errorf("put game %s: %w", g.ID, err)
	}
	return nil
}

func (s *Store) PutDay(ctx context.Context, d Day) error {
	_, err := s.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(s.table),
		Item: map[string]types.AttributeValue{
			"PK":      &types.AttributeValueMemberS{Value: dayPrefix + d.ID},
			"SK":      &types.AttributeValueMemberS{Value: skProfile},
			"Name":  &types.AttributeValueMemberS{Value: d.Name},
			"Place": &types.AttributeValueMemberS{Value: d.Place},
		},
	})
	if err != nil {
		return fmt.Errorf("put day %s: %w", d.ID, err)
	}
	return nil
}

func stringAttr(item map[string]types.AttributeValue, key string) string {
	if v, ok := item[key].(*types.AttributeValueMemberS); ok {
		return v.Value
	}
	return ""
}

func intAttr(item map[string]types.AttributeValue, key string) int {
	if v, ok := item[key].(*types.AttributeValueMemberN); ok {
		n, _ := strconv.Atoi(v.Value)
		return n
	}
	return 0
}

func boolAttr(item map[string]types.AttributeValue, key string) bool {
	if v, ok := item[key].(*types.AttributeValueMemberBOOL); ok {
		return v.Value
	}
	return false
}
