terraform {
  required_version = ">= 1.5.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 6.0.0"
    }
  }
}

provider "oci" {}

variable "compartment_ocid" {
  description = "OCID do compartment onde a VM será criada."
  type        = string
}

variable "ssh_public_key" {
  description = "Sua chave pública SSH (ex.: conteúdo de id_ed25519.pub)."
  type        = string
}

variable "instance_name" {
  description = "Nome da VM."
  type        = string
  default     = "xauusd-doto-bridge-v31"
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_vcn" "bridge" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = ["10.88.0.0/16"]
  display_name   = "xauusd-doto-bridge-vcn"
  dns_label      = "xaubridge"
}

resource "oci_core_internet_gateway" "bridge" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.bridge.id
  display_name   = "xauusd-doto-bridge-igw"
  enabled        = true
}

resource "oci_core_route_table" "bridge" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.bridge.id
  display_name   = "xauusd-doto-bridge-route"
  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.bridge.id
  }
}

resource "oci_core_security_list" "bridge" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.bridge.id
  display_name   = "xauusd-doto-bridge-security"

  ingress_security_rules {
    protocol    = "6"
    source      = "0.0.0.0/0"
    source_type = "CIDR_BLOCK"
    tcp_options {
      min = 22
      max = 22
    }
    description = "SSH somente. noVNC fica restrito a localhost e usa túnel SSH."
  }

  egress_security_rules {
    protocol         = "all"
    destination      = "0.0.0.0/0"
    destination_type = "CIDR_BLOCK"
  }
}

resource "oci_core_subnet" "bridge" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.bridge.id
  cidr_block                 = "10.88.1.0/24"
  display_name               = "xauusd-doto-bridge-subnet"
  dns_label                  = "bridge"
  route_table_id             = oci_core_route_table.bridge.id
  security_list_ids          = [oci_core_security_list.bridge.id]
  prohibit_public_ip_on_vnic = false
}

resource "oci_core_instance" "bridge" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.compartment_ocid
  display_name        = var.instance_name
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = 2
    memory_in_gbs = 12
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.bridge.id
    assign_public_ip = true
    display_name     = "xauusd-doto-bridge-vnic"
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu.images[0].id
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init.yaml", {
      install_script_b64 = base64encode(file("${path.module}/install.sh"))
    }))
  }

  preserve_boot_volume = false
}

output "public_ip" {
  description = "IP público da VM. Use apenas SSH; noVNC não é exposto diretamente."
  value       = oci_core_instance.bridge.public_ip
}

output "ssh_command" {
  value = "ssh ubuntu@${oci_core_instance.bridge.public_ip}"
}

output "novnc_tunnel_command" {
  value = "ssh -L 6080:127.0.0.1:6080 ubuntu@${oci_core_instance.bridge.public_ip}"
}

output "novnc_url" {
  value = "http://127.0.0.1:6080/vnc.html"
}
