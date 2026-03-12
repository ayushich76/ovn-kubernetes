# Accélération OVS avec le chemin de données du noyau

La solution logicielle OVS est gourmande en CPU, ce qui affecte les performances du système.
et empêcher d’utiliser pleinement la bande passante disponible. Prise en charge d'OVS 2.8 et supérieur
nouvelle fonctionnalité appelée OVS Hardware Offload qui améliore considérablement les performances. 
Cette fonctionnalité permet de décharger le plan de données OVS vers la carte réseau tout en conservant 
Plan de contrôle OVS non modifié. Il utilise la technologie SR-IOV avec représentant VF
périphérique réseau hôte. Le représentant VF joue le même rôle que les appareils TAP
dans la configuration Para-Virtuelle (PV). Un paquet envoyé via le représentant VF sur l'hôte
arrive au VF et un paquet envoyé via le VF est reçu par son représentant.

## Contrôleurs Ethernet pris en charge

Les fabricants suivants sont connus pour travailler :

- Carte réseau Mellanox ConnectX-5
- Carte réseau Mellanox ConnectX-6DX

## Conditions préalables

- Noyau Linux 5.7.0 ou supérieur
- Ouvrez vSwitch 2.13 ou supérieur
- iproute >= 4.12
- plugin-device-sriov
-multus-cni

## Configuration SR-IOV du nœud de travail

Afin d'activer le déchargement du matériel Open vSwitch, les étapes suivantes
sont nécessaires. Veuillez vous assurer que vous disposez des privilèges root pour exécuter les commandes
ci-dessous.

Vérifiez le nombre de VF pris en charge sur la carte réseau

```
cat /sys/class/net/enp3s0f0/device/sriov_totalvfs
8
```

Créer les VF

```
echo '4' > /sys/class/net/enp3s0f0/device/sriov_numvfs
```

Vérifiez que les VF sont créés

```
ip link show enp3s0f0
8: enp3s0f0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP mode DEFAULT qlen 1000
   link/ether a0:36:9f:8f:3f:b8 brd ff:ff:ff:ff:ff:ff
   vf 0 MAC 00:00:00:00:00:00, spoof checking on, link-state auto
   vf 1 MAC 00:00:00:00:00:00, spoof checking on, link-state auto
   vf 2 MAC 00:00:00:00:00:00, spoof checking on, link-state auto
   vf 3 MAC 00:00:00:00:00:00, spoof checking on, link-state auto
```

Configurez le PF pour qu'il soit actif

```
ip link set enp3s0f0 up
```

Dissocier les VF du pilote

```
echo 0000:03:00.2 > /sys/bus/pci/drivers/mlx5_core/unbind
echo 0000:03:00.3 > /sys/bus/pci/drivers/mlx5_core/unbind
echo 0000:03:00.4 > /sys/bus/pci/drivers/mlx5_core/unbind
echo 0000:03:00.5 > /sys/bus/pci/drivers/mlx5_core/unbind
```

Configurer les VF SR-IOV en mode switchdev

```
devlink dev eswitch set pci/0000:03:00.0 mode switchdev
ethtool -K enp3s0f0 hw-tc-offload on
```

Liez les VF au pilote

```
echo 0000:03:00.2 > /sys/bus/pci/drivers/mlx5_core/bind
echo 0000:03:00.3 > /sys/bus/pci/drivers/mlx5_core/bind
echo 0000:03:00.4 > /sys/bus/pci/drivers/mlx5_core/bind
echo 0000:03:00.5 > /sys/bus/pci/drivers/mlx5_core/bind
```

Définir hw-offload=true restart Ouvrir vSwitch

```
systemctl enable openvswitch.service
ovs-vsctl set Open_vSwitch . other_config:hw-offload=true
systemctl restart openvswitch.service
```

## Configuration du plug-in de périphérique réseau Worker Node SR-IOV

This plugin creates device plugin endpoints based on the configurations given in file `/etc/pcidp/config.json`.
Ce fichier de configuration est au format json comme indiqué ci-dessous :

```json
{
    "resourceList": [
         {
            "resourceName": "cx5_sriov_switchdev",
            "selectors": {
                "vendors": ["15b3"],
                "devices": ["1018"]
            }
        }
    ]
}
```

Déployez le plug-in de périphérique réseau SR-IOV en tant que démon, voir https://github.com/intel/sriov-network-device-plugin

## Configuration du nœud de travail Multus CNI

Configuration multiple
```json
{
  "name": "multus-cni-network",
  "type": "multus",
  "clusterNetwork": "default",
  "defaultNetworks":[],
  "kubeconfig": "/etc/kubernetes/node-kubeconfig.yaml"
}
```

Déployez Multus CNI en tant que démon, voir https://github.com/intel/multus-cni

Créer un CRD NetworkAttachementDefinition avec la configuration OVN CNI

```yaml
Kubernetes Network CRD Spec:
apiVersion: "k8s.cni.cncf.io/v1"
kind: NetworkAttachmentDefinition
metadata:
  name: default
  annotations:
    k8s.v1.cni.cncf.io/resourceName: mellanox.com/cx5_sriov_switchdev
spec:
  Config: '{"cniVersion":"0.3.1","name":"ovn-kubernetes","type":"ovn-k8s-cni-overlay","ipam":{},"dns":{}}'
```

## Déployer POD avec le déchargement matériel OVS

Créez une spécification POD et

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: ovs-offload-pod1
  annotations:
    v1.multus-cni.io/default-network: default
spec:
  containers:
  - name: appcntr1
    image: centos/tools
    resources:
      requests:
        mellanox.com/cx5_sriov_switchdev: '1'
      limits:
        mellanox.com/cx5_sriov_switchdev: '1'
```

## Vérifiez que le déchargement matériel fonctionne

Recherchez le représentant VF, dans cet exemple, il s'agit de e5a1c8fcef0f327

```
$ ip link show enp3s0f0
6: enp3s0f0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq master ovs-system state UP mode DEFAULT group default qlen 1000
   link/ether ec:0d:9a:46:9e:84 brd ff:ff:ff:ff:ff:ff
   vf 0 MAC 00:00:00:00:00:00, spoof checking off, link-state enable, trust off, query_rss off
   vf 1 MAC 00:00:00:00:00:00, spoof checking off, link-state enable, trust off, query_rss off
   vf 2 MAC 00:00:00:00:00:00, spoof checking off, link-state enable, trust off, query_rss off
   vf 3 MAC fa:16:3e:b9:b8:ce, vlan 57, spoof checking on, link-state enable, trust off, query_rss off

compute_node2# ls -l /sys/class/net/
lrwxrwxrwx 1 root root 0 Sep 11 10:54 eth0 -> ../../devices/virtual/net/eth0
lrwxrwxrwx 1 root root 0 Sep 11 10:54 eth1 -> ../../devices/virtual/net/eth1
lrwxrwxrwx 1 root root 0 Sep 11 10:54 eth2 -> ../../devices/virtual/net/eth2
lrwxrwxrwx 1 root root 0 Sep 11 10:54 e5a1c8fcef0f327 -> ../../devices/virtual/net/e5a1c8fcef0f327
```

Accéder au POD

```
kubectl exec -it ovs-offload-pod1 -- /bin/bash
```

Ping un autre POD sur le deuxième nœud de travail
```
ping ovs-offload-pod2
```

Vérifiez le trafic sur le port du représentant VF. Vérifiez que seul le premier paquet ICMP apparaît
```
tcpdump -nnn -i e5a1c8fcef0f327

tcpdump: verbose output suppressed, use -v or -vv for full protocol decode
17:12:41.260487 IP 172.0.0.13 > 172.0.0.10: ICMP echo request, id 1263, seq 1, length 64
17:12:41.260778 IP 172.0.0.10 > 172.0.0.13: ICMP echo reply, id 1263, seq 1, length 64
17:12:46.268951 ARP, Request who-has 172.0.0.13 tell 172.0.0.10, length 42
17:12:46.271771 ARP, Reply 172.0.0.13 is-at fa:16:3e:1a:10:05, length 46
17:12:55.354737 IP6 fe80::f816:3eff:fe29:8118 > ff02::1: ICMP6, router advertisement, length 64
17:12:56.106705 IP 0.0.0.0.68 > 255.255.255.255.67: BOOTP/DHCP, Request from 62:21:f0:89:40:73, length 30
```

## Prise en charge du déchargement matériel OVS DPU

[Unités de traitement des données](https://blogs.nvidia.com/blog/2020/05/20/whats-a-dpu-data-processing-unit/) (DPU) combinent les capacités avancées
d'une carte réseau intelligente (telle que la carte réseau Mellanox ConnectX-6DX) avec un processeur intégré à usage général et un contrôleur de mémoire haute vitesse.

De la même manière que les Smart-NIC, un DPU suit le modèle switchdev du noyau.
Dans ce modèle, chaque périphérique réseau VF/PF sur l'hôte a un périphérique réseau représentant correspondant existant sur
le processeur intégré.

### DPU pris en charge

Les fabricants suivants sont connus pour travailler :

- [Mellanox Bluefield-2](https://www.mellanox.com/products/bluefield2-overview)

Le guide de déploiement peut être trouvé [ici](https://docs.google.com/document/d/1hRke0cOCY84Ef8OU283iPg_PHiJ6O17aUkb9Vv-fWPQ/edit?usp=sharing).

## vDPA

vDPA (Virtio DataPath Acceleration) est une technologie qui permet d'accélérer les appareils virtIO tout en
permettant aux implémentations de tels appareils (par exemple : les fournisseurs de cartes réseau) d'utiliser leur propre plan de contrôle.

vDPA peut être combiné avec la configuration de déchargement matériel SR-IOV OVS pour exposer la charge de travail à un
interface standard ouverte telle que virtio-net.

### Conditions préalables supplémentaires :
* Noyau Linux >= 5.12
* IProute >= 5,14

### Matériel pris en charge :
- Carte réseau Mellanox ConnectX-6DX

### Configuration supplémentaire
En plus de toutes les étapes répertoriées ci-dessus, insérez le pilote virtio-vdpa et le pilote mlx-vdpa :

    $ modprobe vdpa
    $ modprobe virtio-vdpa
    $ modprobe mlx5-vdpa

The the `vdpa` tool (part of iproute package) is used to create a vdpa device on top
d'une VF existante :

    $ vdpa mgmtdev afficher
    pci/0000:65:00.2 :
      réseau_classes_supportées
    $ vdpa dev ajouter le nom vdpa2 mgmtdev pci/0000:65:00.2
    $ liste de développeurs vdpa
    vdpa2 : tapez réseau mgmtdev pci/0000:65:00.2 supplier_id 5555 max_vqs 16 max_vq_size 256

Une fois qu'un périphérique a été créé, la configuration du plug-in SR-IOV Device Plugin doit être modifiée pour celui-ci.
pour sélectionner et exposer le périphérique vdpa :

```json
{
    "resourceList": [
         {
            "resourceName": "cx6_sriov_vpda_virtio",
            "selectors": {
               "vendors": ["15b3"],
               "devices": ["101e"],
               "vdpaType": "virtio"
            }
        }
    ]
}
```
