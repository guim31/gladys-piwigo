# Piwigo

Votre galerie photo [Piwigo](https://piwigo.org) dans Gladys, sur votre réseau
local : le nombre de photos, d'albums et d'utilisateurs, la dernière photo
ajoutée, un appareil par album que vous voulez suivre, des scènes qui
réagissent à l'arrivée de nouvelles photos ou à un album qui grandit, une
action de scène qui lit les dernières photos, et un widget de tableau de bord
avec les dernières photos.

L'intégration a été testée contre une vraie galerie Piwigo (l'image Docker
`linuxserver/piwigo`, Piwigo 16.4.0), pas encore dans une vraie installation de
Gladys : vos retours sont les bienvenus sur le
[forum Gladys](https://community.gladysassistant.com) ou dans les
[issues](https://github.com/guim31/gladys-piwigo/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- Une galerie **Piwigo** joignable depuis Gladys (même réseau).
- Idéalement, une **clé d'API** (Piwigo 16 ou plus récent) : dans Piwigo,
  ouvrez votre **profil**, **Clés d'API**, créez-en une et copiez la clé
  entière : son identifiant, deux-points, son secret (`pkid-20261025-…:…`). La
  clé agit comme son compte : une clé d'**administrateur** donne aussi le
  nombre d'utilisateurs.
- Sinon, le nom et le mot de passe d'un compte (toute version de Piwigo avec
  l'API web).
- Sans l'un ni l'autre, l'intégration lit la galerie en invité : albums publics
  seulement.

## Mise en place

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, saisissez l'**Adresse de la galerie** avec son port
   et son dossier (par exemple `http://192.168.1.20/piwigo` ; une page de la
   galerie copiée depuis le navigateur convient aussi) et collez la **clé
   d'API** dans le champ mot de passe, nom d'utilisateur vide. Avec un compte,
   saisissez plutôt son nom d'utilisateur et son mot de passe.
3. Si vous le souhaitez, indiquez les **Albums à suivre** : noms ou
   identifiants séparés par des virgules (`Vacances, 12`) ; un sous-album par
   son chemin (`Vacances / Plage`). L'identifiant est le nombre à la fin de
   l'adresse de l'album (`index.php?/category/12`) : utilisez-le pour un nom qui
   contient une virgule.
4. Choisissez le **Rafraîchissement** (5 minutes par défaut) et la **Langue des
   noms**, puis enregistrez. **Tester la connexion** lit la galerie tout de
   suite et signale les albums introuvables.
5. Dans **Découverte**, ajoutez l'appareil **Piwigo** et les appareils d'album
   que vous voulez.

## Appareils

L'appareil **Piwigo** montre toute la galerie (lecture seule) :

| Fonctionnalité         | Ce qu'elle montre                                                             |
| ---------------------- | ----------------------------------------------------------------------------- |
| Photos                 | Photos visibles par le compte                                                 |
| Albums                 | Albums visibles par le compte, sous-albums compris                            |
| Utilisateurs           | Utilisateurs de la galerie (compte ou clé administrateur seulement)           |
| Dernière photo ajoutée | Son nom, son album et le jour : `Coucher de soleil · Vacances · 25 oct. 2026` |

Chaque album suivi donne un appareil **Piwigo – chemin de l'album** :

| Fonctionnalité | Ce qu'elle montre                                                  |
| -------------- | ------------------------------------------------------------------ |
| Photos         | Photos de l'album et de ses sous-albums                            |
| Dernier ajout  | Jour et heure de la dernière photo ajoutée : `25 oct. 2026, 07:50` |

L'intégration lit la galerie elle-même (trois ou quatre petites requêtes par
lecture) : rien à régler côté Gladys. Le badge de connexion des appareils passe
au rouge quand la galerie ne répond plus.

## Tableau de bord

Le widget **Dernières photos** montre les compteurs (photos, albums,
utilisateurs) et les dernières photos ajoutées : nom, album, jour ; un appui
montre l'heure d'ajout et le jour de prise de vue. Avec le réglage **Album
suivi**, il montre l'un de vos albums suivis au lieu de toute la galerie.

Les miniatures sont **désactivées par défaut** : avec le réglage **Afficher les
miniatures**, la petite miniature de chaque photo s'affiche, et vos photos
apparaissent alors sur tout écran qui affiche ce tableau de bord (une tablette
partagée, un tableau de bord public, Gladys Plus). Le navigateur ne charge
jamais Piwigo directement : Gladys le demande à l'intégration, qui ne sert que
les photos listées par le widget.

## Scènes

### Déclencheurs

- **Nouvelles photos ajoutées** : des photos ont été ajoutées à la galerie,
  quel que soit le moyen (envoi web, application mobile, synchronisation),
  vues à la lecture suivante. Variables : nombre de photos ajoutées, nom,
  album, date d'ajout et page de la dernière.
- **Photos ajoutées à un album** : un album, sous-albums compris, contient plus
  de photos qu'à la lecture précédente (un nouvel album compte depuis zéro).
  Filtre : le nom de l'album, exactement comme dans Piwigo, sans ses albums
  parents. Variables : nom, chemin et identifiant de l'album, photos ajoutées,
  photos dans l'album, page de l'album. Une photo ajoutée à un sous-album active
  aussi ce déclencheur pour ses albums parents.

### Actions

- **Lire les dernières photos** : lit tout de suite les dernières photos
  ajoutées, de toute la galerie ou d'un album (nom, chemin ou identifiant ;
  sous-albums compris). Sorties pour les actions suivantes de la scène : photos
  ajoutées en 24 heures, photos au total, nom, album, date d'ajout et page de
  la dernière. Rien ne change dans Piwigo.

### Idées de scènes

- Sur **Nouvelles photos ajoutées**, envoyez un message à la famille :
  « {{count}} nouvelles photos, la dernière : {{name}} dans {{album}} ».
- Chaque soir à 21 h, **Lire les dernières photos** de l'album « Famille », et
  si **Photos ajoutées en 24 heures** dépasse 0, affichez un message sur la
  tablette du salon.
- Sur **Photos ajoutées à un album** « Vacances 2026 », allumez le couloir en
  bleu.

## Dépannage

- **« clé d'API, nom d'utilisateur ou mot de passe refusé »** : la clé a expiré,
  a été révoquée ou n'a pas été collée en entier (identifiant, deux-points,
  secret) ; avec un compte, vérifiez le mot de passe.
- **« la galerie ne répond pas »** : vérifiez l'adresse, le port et le dossier
  depuis la machine de Gladys.
- **« aucune galerie Piwigo à cette adresse »** : l'adresse mène à une autre page
  (page de connexion d'un proxy inverse, autre application) : saisissez
  l'adresse de la galerie elle-même.
- **« certificat refusé »** : un certificat auto-signé ; utilisez l'adresse en
  `http://` de votre réseau.
- **Les nouvelles photos n'apparaissent pas** : Piwigo peut garder les photos
  envoyées par l'application mobile ou l'API web dans une salle d'attente (le
  « lounge ») jusqu'à la fin de l'envoi ; elles apparaissent à la lecture
  suivante.
- **Le nombre d'utilisateurs reste vide** : le compte ou la clé n'est pas
  administrateur.
- `LOG_LEVEL=debug` dans les logs de l'intégration montre chaque lecture.

## Limites

- Les nouvelles photos sont vues à la lecture suivante (5 minutes par défaut),
  et seulement celles que le compte peut voir.
- L'intégration ne fait que lire : elle ne modifie, n'envoie ni ne supprime
  rien dans Piwigo.
- Aucune photo ne quitte votre réseau par l'intégration, sauf si vous activez
  les miniatures du widget.
- Les dates sont celles du serveur Piwigo, telles qu'il les affiche.
- Sans lien avec le projet Piwigo.
