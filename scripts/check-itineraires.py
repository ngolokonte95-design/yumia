#!/usr/bin/env python3
"""
Vérifie que chaque étape d'itinéraire est illustrée par le lieu qu'elle nomme.

Trois bugs successifs ont produit le même symptôme — « les photos ne vont pas
avec les descriptions » — et aucun n'était visible autrement qu'en générant de
vrais itinéraires puis en comparant, étape par étape, l'intitulé au lieu
réellement attaché :

  « Le Sergent Recruteur – Île Saint-Louis »  →  Île Saint-Louis (l'île)
  « Glacerie Peron »                          →  Glacerie La Cigale
  « Musée d'Histoire de Marseille »           →  Musée Subaquatique de Marseille

À relancer après toute modification de `namesMatch`, `isGenericName` ou de la
liste des mots non distinctifs. Une ligne dont le lieu ne ressemble pas à
l'intitulé est un faux positif à examiner ; « sans lieu » n'est pas une erreur,
c'est le refus de mentir faute de correspondance.

    YUMIA_EMAIL=... YUMIA_PASSWORD=... python scripts/check-itineraires.py
"""
import json
import os
import sys
import urllib.request

API = os.environ.get('YUMIA_API', 'https://api.yumia.eu/api')
EMAIL = os.environ.get('YUMIA_EMAIL')
PASSWORD = os.environ.get('YUMIA_PASSWORD')

# Trois villes, trois modes : de quoi croiser les chemins de résolution
# (base locale, fournisseur, substitution d'un intitulé générique).
CASES = [
    ('Paris', 'date', 'soirée'),
    ('Lyon', 'amis', 'journée'),
    ('Marseille', 'famille', 'journée'),
]


def call(path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, headers=headers)
    return json.load(urllib.request.urlopen(req, timeout=180))


def main():
    if not EMAIL or not PASSWORD:
        sys.exit('YUMIA_EMAIL et YUMIA_PASSWORD sont requis.')
    token = call('/auth/login', {'email': EMAIL, 'password': PASSWORD})['tokens']['accessToken']

    for city, mood, duration in CASES:
        print('=' * 72)
        print(f'{city} / {mood} / {duration}')
        result = call('/itinerary/generate',
                      {'mood': mood, 'duration': duration, 'budget': 'moyen', 'city': city},
                      token)
        for step in result.get('steps', []):
            place_id = step.get('placeId')
            if not place_id:
                print(f"  [sans lieu] {step['name'][:60]}")
                continue
            try:
                place = call('/places/' + place_id, token=token)
                print(f"  {step['name'][:50]:52} -> {place.get('name')}")
            except Exception as err:  # noqa: BLE001 — diagnostic, pas de reprise
                print(f"  {step['name'][:50]:52} -> erreur {err}")


if __name__ == '__main__':
    main()
