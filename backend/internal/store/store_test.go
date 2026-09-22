package store

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func s(v string) types.AttributeValue { return &types.AttributeValueMemberS{Value: v} }
func n(v string) types.AttributeValue { return &types.AttributeValueMemberN{Value: v} }
func b(v bool) types.AttributeValue   { return &types.AttributeValueMemberBOOL{Value: v} }
func item(kv ...interface{}) map[string]types.AttributeValue {
	m := map[string]types.AttributeValue{}
	for i := 0; i < len(kv); i += 2 {
		m[kv[i].(string)] = kv[i+1].(types.AttributeValue)
	}
	return m
}

func TestAssembleSnapshot(t *testing.T) {
	items := []map[string]types.AttributeValue{
		item("PK", s("PLAYER#alex"), "SK", s("PROFILE"), "Name", s("Alex"), "Initial", s("A")),
		item("PK", s("PLAYER#bea"), "SK", s("PROFILE"), "Name", s("Bea"), "Initial", s("B")),

		item("PK", s("GAME#catan"), "SK", s("PROFILE"), "Name", s("Catan"), "Min", n("3"), "Max", n("4")),
		item("PK", s("GAME#catan"), "SK", s("INTEREST#alex"), "Interested", b(true)),
		item("PK", s("GAME#catan"), "SK", s("INTEREST#bea"), "Interested", b(false)),

		item("PK", s("DAY#friday"), "SK", s("PROFILE"), "Name", s("Viernes")),
		item("PK", s("DAY#friday"), "SK", s("ATTENDEE#bea"), "Attending", b(true)),
		item("PK", s("DAY#friday"), "SK", s("ATTENDEE#alex"), "Attending", b(false)),
	}

	got := assembleSnapshot(items)

	if len(got.Players) != 2 || got.Players[0].ID != "alex" || got.Players[1].ID != "bea" {
		t.Fatalf("unexpected players: %+v", got.Players)
	}
	if got.Players[0].Name != "Alex" || got.Players[0].Initial != "A" {
		t.Fatalf("unexpected player fields: %+v", got.Players[0])
	}

	if len(got.Games) != 1 {
		t.Fatalf("expected 1 game, got %d", len(got.Games))
	}
	game := got.Games[0]
	if game.ID != "catan" || game.Name != "Catan" || game.Min != 3 || game.Max != 4 {
		t.Fatalf("unexpected game metadata: %+v", game)
	}
	if !game.Interest["alex"] || game.Interest["bea"] {
		t.Fatalf("unexpected interest map: %+v", game.Interest)
	}

	if len(got.Days) != 1 {
		t.Fatalf("expected 1 day, got %d", len(got.Days))
	}
	day := got.Days[0]
	if day.ID != "friday" || day.Name != "Viernes" {
		t.Fatalf("unexpected day metadata: %+v", day)
	}
	// Only bea has Attending=true; alex's ATTENDEE item is explicitly false
	// and must not appear in the attendee list.
	if len(day.Attendees) != 1 || day.Attendees[0] != "bea" {
		t.Fatalf("unexpected attendees: %+v", day.Attendees)
	}
}

func TestAssembleSnapshotEmpty(t *testing.T) {
	got := assembleSnapshot(nil)
	if len(got.Players) != 0 || len(got.Games) != 0 || len(got.Days) != 0 {
		t.Fatalf("expected empty snapshot, got %+v", got)
	}
}

func TestAssembleSnapshotGameWithNoInterestItems(t *testing.T) {
	items := []map[string]types.AttributeValue{
		item("PK", s("GAME#wingspan"), "SK", s("PROFILE"), "Name", s("Wingspan"), "Min", n("1"), "Max", n("5")),
	}
	got := assembleSnapshot(items)
	if len(got.Games) != 1 {
		t.Fatalf("expected 1 game, got %d", len(got.Games))
	}
	if got.Games[0].Interest == nil {
		t.Fatal("expected non-nil (possibly empty) interest map")
	}
}
